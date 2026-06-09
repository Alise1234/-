"""
AI 决策 API 路由 — DeepSeek 驱动 + 规则引擎降级
"""
import time
import json
import os
import logging
from fastapi import APIRouter, Query
from typing import Optional
from pydantic import BaseModel
from sqlalchemy import desc

from database import SessionLocal
from models import StockBasic, StockDailyK, StockIndicator, StockScore, PortfolioPosition
from services.indicator_service import calc_all, indicators_summary
from services.score_service import calc_five_dim_scores
from services.ai_decision_service import deepseek_decide, batch_decide
from services.ai_analysis_service import generate_analysis
import pandas as pd

router = APIRouter(prefix="/api/ai", tags=["AI决策"])
logger = logging.getLogger(__name__)


# ============================================================
#  Data Helpers
# ============================================================

def _prepare_stock_data(code: str, db) -> dict:
    """组装单只股票的评分和指标数据（优先读DB）"""
    score_row = (
        db.query(StockScore).filter(StockScore.code == code)
        .order_by(desc(StockScore.calc_date)).first()
    )
    ind_row = (
        db.query(StockIndicator).filter(StockIndicator.code == code)
        .order_by(desc(StockIndicator.trade_date)).first()
    )
    pos_row = (
        db.query(PortfolioPosition).filter(PortfolioPosition.code == code)
        .filter(PortfolioPosition.status == "holding").first()
    )
    basic = db.query(StockBasic).filter(StockBasic.code == code).first()

    scores = {
        "total_score": score_row.total_score if score_row else 50,
        "trend_score": score_row.trend_score if score_row else 15,
        "capital_score": score_row.capital_score if score_row else 12,
        "valuation_score": score_row.valuation_score if score_row else 8,
        "sentiment_score": score_row.sentiment_score if score_row else 8,
        "risk_score": score_row.risk_score if score_row else 8,
    }

    def _f(v): return float(v) if v else None
    indicators = {
        "close": _f(ind_row.ma5) if ind_row else None,
        "ma5": _f(ind_row.ma5) if ind_row else None,
        "ma10": _f(ind_row.ma10) if ind_row else None,
        "ma20": _f(ind_row.ma20) if ind_row else None,
        "ma60": _f(ind_row.ma60) if ind_row else None,
        "macd_dif": _f(ind_row.macd_dif) if ind_row else None,
        "macd_dea": _f(ind_row.macd_dea) if ind_row else None,
        "macd_hist": _f(ind_row.macd_hist) if ind_row else None,
        "rsi6": _f(ind_row.rsi6) if ind_row else None,
        "rsi12": _f(ind_row.rsi12) if ind_row else None,
        "rsi24": _f(ind_row.rsi24) if ind_row else None,
        "boll_upper": _f(ind_row.boll_upper) if ind_row else None,
        "boll_mid": _f(ind_row.boll_mid) if ind_row else None,
        "boll_lower": _f(ind_row.boll_lower) if ind_row else None,
        "kdj_k": _f(ind_row.kdj_k) if ind_row else None,
        "kdj_d": _f(ind_row.kdj_d) if ind_row else None,
        "kdj_j": _f(ind_row.kdj_j) if ind_row else None,
        "atr14": _f(ind_row.atr14) if ind_row else None,
    }

    current_position = None
    if pos_row and pos_row.quantity and pos_row.quantity > 0:
        current_position = {
            "quantity": pos_row.quantity,
            "buy_price": float(pos_row.buy_price) if pos_row.buy_price else 0,
            "current_price": float(pos_row.current_price) if pos_row.current_price else 0,
            "profit_pct": float(pos_row.profit_pct) if pos_row.profit_pct else 0,
        }

    return {
        "name": basic.name if basic else code,
        "scores": scores,
        "indicators": indicators,
        "current_position": current_position,
    }


# ============================================================
#  1. 单只股票 AI 决策
# ============================================================

class DecideRequest(BaseModel):
    code: str


@router.post("/recommend")
async def ai_recommend(req: DecideRequest):
    """
    AI 个股推荐决策
    返回: {action, confidence, position_pct, reason, source}
    """
    db = SessionLocal()
    try:
        data = _prepare_stock_data(req.code, db)
        t0 = time.time()
        result = deepseek_decide(
            code=req.code, name=data["name"],
            scores=data["scores"], indicators=data["indicators"],
            model="deepseek-chat", current_position=data["current_position"],
        )
        elapsed = round((time.time() - t0) * 1000)
        return {
            "success": True, "code": req.code, "name": data["name"],
            "elapsed_ms": elapsed, **result,
        }
    except Exception as e:
        return {"success": False, "code": req.code, "error": str(e)}
    finally:
        db.close()


@router.get("/decide/{code}")
async def decide_get(code: str):
    """GET 方式 AI 决策"""
    return await ai_recommend(DecideRequest(code=code))


# ============================================================
#  2. 个股深度分析报告
# ============================================================

@router.get("/analyze/{code}")
async def ai_analyze(code: str):
    """
    AI 个股深度分析
    返回: trend_analysis, capital_analysis, risk_analysis, position_advice, buy_range 等
    """
    t0 = time.time()
    result = generate_analysis(code)
    elapsed = round((time.time() - t0) * 1000)
    if "error" in result:
        return {"success": False, "code": code, "error": result["error"], "elapsed_ms": elapsed}
    return {"success": True, "code": code, "elapsed_ms": elapsed, **result}


# ============================================================
#  3. 风险分析
# ============================================================

@router.get("/risk/{code}")
async def ai_risk(code: str):
    """
    AI 风险评估
    返回简化的风险分析
    """
    result = generate_analysis(code)
    if "error" in result:
        return {"success": False, "code": code, "error": result["error"]}
    return {
        "success": True, "code": code,
        "source": result.get("source", "rule_engine"),
        "risk_analysis": result.get("risk_analysis", ""),
        "stop_loss": result.get("stop_loss", ""),
        "position_pct": result.get("position_pct", 0),
        "scores": result.get("scores", {}),
    }


# ============================================================
#  4. 市场全景分析
# ============================================================

class MarketAnalyzeRequest(BaseModel):
    stocks: list = []
    sectors: list = []
    sentiment: dict = {}
    portfolio: list = []
    customPrompt: str = ""


@router.post("/analyze-market")
async def analyze_market(req: MarketAnalyzeRequest):
    """
    AI 市场全景分析（对接前端 AiAnalysis）
    """
    api_key = os.getenv("DEEPSEEK_API_KEY")
    if not api_key:
        return {
            "success": False, "source": "fallback",
            "error": "deepseek unavailable",
            "marketOutlook": "DeepSeek API Key 未配置",
            "recommendedSectors": [], "recommendedStocks": [],
            "riskWarning": "AI 服务不可用", "positionSizingAdvice": "请配置 DEEPSEEK_API_KEY",
        }

    # 构建股票摘要
    stock_lines = []
    for s in (req.stocks or [])[:15]:
        name = s.get("name", "") if isinstance(s, dict) else getattr(s, "name", "")
        code = s.get("code", "") if isinstance(s, dict) else getattr(s, "code", "")
        sc = s.get("scores", {}) if isinstance(s, dict) else getattr(s, "scores", {})
        if isinstance(sc, dict):
            stock_lines.append(
                f"{code} {name} 估值:{sc.get('valuation','?')} "
                f"技术:{sc.get('technical','?')} 资金:{sc.get('capitalFlow','?')}"
            )

    sectors_str = json.dumps((req.sectors or [])[:5], ensure_ascii=False)
    sentiment_str = json.dumps(req.sentiment or {}, ensure_ascii=False)

    prompt = "\n".join([
        "你是A股首席投研分析师。基于以下数据给出中文投资建议。",
        f"股票池:\n" + "\n".join(stock_lines) if stock_lines else "无数据",
        f"板块热度: {sectors_str}",
        f"市场情绪: {sentiment_str}",
        f"用户指令: {req.customPrompt}" if getattr(req, "customPrompt", "") else "",
        "",
        "只输出一行JSON，无其他文字:",
        '{"marketOutlook":"大盘展望100字","recommendedSectors":["板块1","板块2"],'
        '"recommendedStocks":["备选股1","备选股2"],"riskWarning":"风险提示50字",'
        '"positionSizingAdvice":"仓位建议50字"}',
    ])

    t0 = time.time()
    try:
        from openai import OpenAI
        client = OpenAI(
            api_key=api_key,
            base_url=os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
            timeout=20.0,
        )
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.5, max_tokens=1024,
        )
        text = response.choices[0].message.content.strip()
        if "```" in text:
            text = text.split("```")[1]
            if text.startswith("json"): text = text[4:]
            text = text.split("```")[0]
        start, end = text.find("{"), text.rfind("}") + 1
        if start >= 0 and end > start:
            text = text[start:end]
        result = json.loads(text)
        result["source"] = "deepseek"
        result["tokens_used"] = response.usage.total_tokens if response.usage else None
        result["elapsed_ms"] = round((time.time() - t0) * 1000)
        return result
    except Exception as e:
        logger.error(f"DeepSeek市场分析失败: {e}")
        return {
            "success": False, "source": "fallback",
            "error": "deepseek unavailable",
            "marketOutlook": f"AI分析暂不可用",
            "recommendedSectors": [], "recommendedStocks": [],
            "riskWarning": "服务异常，请稍后重试",
            "positionSizingAdvice": "建议人工判断",
            "elapsed_ms": round((time.time() - t0) * 1000),
        }


# ============================================================
#  5. 批量决策
# ============================================================

@router.post("/batch-decide")
async def batch_decide_endpoint(codes: list[str]):
    """批量 AI 决策"""
    db = SessionLocal()
    try:
        stocks = []
        for code in codes:
            data = _prepare_stock_data(code, db)
            stocks.append({
                "code": code, "name": data["name"],
                "scores": data["scores"], "indicators": data["indicators"],
                "position": data["current_position"],
            })
        results = batch_decide(stocks)
        return {"success": True, "count": len(results), "data": results}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        db.close()
