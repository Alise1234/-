"""
股票筛选 API 路由
"""
from fastapi import APIRouter, Query
from services.screener_service import get_top_stocks, get_top_stocks_realtime

router = APIRouter(prefix="/api/screener", tags=["股票筛选"])


@router.get("/top")
async def top_stocks(
    limit: int = Query(20, ge=1, le=100, description="返回数量"),
    min_score: int = Query(80, ge=0, le=100, description="最低评分"),
    mode: str = Query("db", description="模式: db(数据库) | realtime(实时计算)"),
):
    """
    获取评分最高的股票列表

    筛选条件:
      - total_score >= min_score (默认80)
      - ma20 > ma60 (多头排列)
      - 非ST
      - rsi12 < 80 (未严重超买)

    示例:
      GET /api/screener/top?limit=10&min_score=85
      GET /api/screener/top?mode=realtime&limit=5
    """
    try:
        if mode == "realtime":
            data = get_top_stocks_realtime(limit=limit, min_score=min_score)
        else:
            data = get_top_stocks(limit=limit, min_score=min_score)

        return {
            "success": True,
            "count": len(data),
            "filters": {
                "min_score": min_score,
                "ma20_gt_ma60": True,
                "exclude_st": True,
                "rsi12_lt_80": True,
            },
            "data": data,
        }
    except Exception as e:
        return {"success": False, "error": str(e), "data": []}
