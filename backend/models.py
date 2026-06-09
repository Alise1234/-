"""
ORM 模型定义 — SQLAlchemy
"""
from sqlalchemy import (
    Column, Integer, String, Date, BigInteger, Numeric,
    DateTime, func, UniqueConstraint, Text, Boolean, Index
)
from sqlalchemy.dialects.postgresql import JSONB
from database import Base


class StockBasic(Base):
    """股票基础信息表"""
    __tablename__ = "stock_basic"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(10), unique=True, nullable=False, comment="股票代码")
    name = Column(String(50), nullable=False, comment="股票名称")
    industry = Column(String(50), comment="所属行业")
    market = Column(String(10), comment="市场: SH/SZ/BJ")
    list_date = Column(Date, comment="上市日期")
    is_st = Column(Boolean, default=False, comment="是否ST股")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class StockDailyK(Base):
    """日K线数据表"""
    __tablename__ = "stock_daily_k"
    __table_args__ = (
        UniqueConstraint("code", "trade_date", name="uq_code_date"),
    )

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(10), nullable=False, index=True, comment="股票代码")
    trade_date = Column(Date, nullable=False, index=True, comment="交易日期")
    open = Column(Numeric(10, 2))
    high = Column(Numeric(10, 2))
    low = Column(Numeric(10, 2))
    close = Column(Numeric(10, 2))
    volume = Column(BigInteger, comment="成交量(股)")
    amount = Column(Numeric(16, 2), comment="成交额(元)")
    amplitude = Column(Numeric(8, 4), comment="振幅(%)")
    pct_change = Column(Numeric(8, 4), comment="涨跌幅(%)")
    turnover = Column(Numeric(8, 4), comment="换手率(%)")
    pe = Column(Numeric(10, 2), comment="市盈率")
    pb = Column(Numeric(10, 2), comment="市净率")
    created_at = Column(DateTime, server_default=func.now())


class StockIndicator(Base):
    """技术指标表"""
    __tablename__ = "stock_indicator"
    __table_args__ = (
        UniqueConstraint("code", "trade_date", name="uq_ind_code_date"),
    )

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(10), nullable=False, index=True, comment="股票代码")
    trade_date = Column(Date, nullable=False, index=True, comment="交易日期")

    # MA
    ma5 = Column(Numeric(10, 2))
    ma10 = Column(Numeric(10, 2))
    ma20 = Column(Numeric(10, 2))
    ma60 = Column(Numeric(10, 2))

    # MACD
    macd_dif = Column(Numeric(10, 4))
    macd_dea = Column(Numeric(10, 4))
    macd_hist = Column(Numeric(10, 4))

    # RSI
    rsi6 = Column(Numeric(8, 2))
    rsi12 = Column(Numeric(8, 2))
    rsi24 = Column(Numeric(8, 2))

    # BOLL
    boll_upper = Column(Numeric(10, 2))
    boll_mid = Column(Numeric(10, 2))
    boll_lower = Column(Numeric(10, 2))
    boll_width = Column(Numeric(8, 2))
    boll_pct_b = Column(Numeric(8, 4))

    # KDJ
    kdj_k = Column(Numeric(8, 2))
    kdj_d = Column(Numeric(8, 2))
    kdj_j = Column(Numeric(8, 2))

    # Volume
    vol_ma5 = Column(BigInteger)
    vol_ma20 = Column(BigInteger)

    # ATR
    atr14 = Column(Numeric(10, 4))

    created_at = Column(DateTime, server_default=func.now())


class StockScore(Base):
    """五维评分表"""
    __tablename__ = "stock_score"
    __table_args__ = (
        UniqueConstraint("code", "calc_date", name="uq_score_code_date"),
    )

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(10), nullable=False, index=True, comment="股票代码")
    calc_date = Column(Date, nullable=False, index=True, comment="计算日期")

    total_score = Column(Integer, comment="综合评分 0-100")
    trend_score = Column(Integer, comment="趋势评分 0-30")
    capital_score = Column(Integer, comment="资金评分 0-25")
    valuation_score = Column(Integer, comment="估值评分 0-15")
    sentiment_score = Column(Integer, comment="情绪评分 0-15")
    risk_score = Column(Integer, comment="风险评分 0-15")

    close = Column(Numeric(10, 2))
    details = Column(JSONB, comment="指标详情 JSON")

    created_at = Column(DateTime, server_default=func.now())


class AiAnalysis(Base):
    """AI 分析结果缓存表"""
    __tablename__ = "ai_analysis"

    id = Column(Integer, primary_key=True, index=True)
    analysis_date = Column(Date, nullable=False, index=True, comment="分析日期")
    session_id = Column(String(64), comment="对话会话ID")

    market_outlook = Column(Text, comment="市场展望")
    recommended_sectors = Column(JSONB, comment="推荐板块")
    recommended_stocks = Column(JSONB, comment="推荐股票")
    risk_warning = Column(Text, comment="风险提示")
    position_sizing_advice = Column(Text, comment="仓位建议")

    raw_prompt = Column(Text, comment="原始提示词")
    raw_response = Column(Text, comment="原始AI返回")
    model_used = Column(String(50), comment="使用的模型")

    created_at = Column(DateTime, server_default=func.now())


# ===== 索引 =====
Index("idx_daily_k_code_date", StockDailyK.code, StockDailyK.trade_date)
Index("idx_ind_code_date", StockIndicator.code, StockIndicator.trade_date)
Index("idx_score_code_date", StockScore.code, StockScore.calc_date)
Index("idx_score_total", StockScore.total_score)
Index("idx_ai_date", AiAnalysis.analysis_date)


class PortfolioPosition(Base):
    """投资组合持仓表"""
    __tablename__ = "portfolio_position"
    __table_args__ = (
        UniqueConstraint("code", "status", name="uq_portfolio_code_status"),
    )

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(10), nullable=False, index=True, comment="股票代码")
    name = Column(String(50), comment="股票名称")

    buy_date = Column(Date, comment="买入日期")
    buy_price = Column(Numeric(10, 2), comment="买入均价")

    current_price = Column(Numeric(10, 2), comment="当前价格")

    quantity = Column(Integer, default=0, comment="持仓数量(股)")

    market_value = Column(Numeric(16, 2), default=0, comment="持仓市值")
    profit_amount = Column(Numeric(16, 2), default=0, comment="浮动盈亏")
    profit_pct = Column(Numeric(8, 4), default=0, comment="盈亏比例(%)")

    score = Column(Integer, comment="当前评分")

    status = Column(String(10), default="holding", comment="状态: holding/sold")

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
