-- ============================================
-- A股AI选股系统 — 数据库初始化脚本 v2
-- PostgreSQL 11+
-- ============================================

-- 1. 股票基础信息表
CREATE TABLE IF NOT EXISTS stock_basic (
    id SERIAL PRIMARY KEY,
    code VARCHAR(10) NOT NULL UNIQUE,
    name VARCHAR(50) NOT NULL,
    industry VARCHAR(50),
    market VARCHAR(10),
    list_date DATE,
    is_st BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. 日K线数据表
CREATE TABLE IF NOT EXISTS stock_daily_k (
    id SERIAL PRIMARY KEY,
    code VARCHAR(10) NOT NULL,
    trade_date DATE NOT NULL,
    open DECIMAL(10,2),
    high DECIMAL(10,2),
    low DECIMAL(10,2),
    close DECIMAL(10,2),
    volume BIGINT,
    amount DECIMAL(16,2),
    amplitude DECIMAL(8,4),
    pct_change DECIMAL(8,4),
    turnover DECIMAL(8,4),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(code, trade_date)
);

-- 3. 技术指标表
CREATE TABLE IF NOT EXISTS stock_indicator (
    id SERIAL PRIMARY KEY,
    code VARCHAR(10) NOT NULL,
    trade_date DATE NOT NULL,

    -- MA
    ma5 DECIMAL(10,2),
    ma10 DECIMAL(10,2),
    ma20 DECIMAL(10,2),
    ma60 DECIMAL(10,2),

    -- MACD
    macd_dif DECIMAL(10,4),
    macd_dea DECIMAL(10,4),
    macd_hist DECIMAL(10,4),

    -- RSI
    rsi6 DECIMAL(8,2),
    rsi12 DECIMAL(8,2),
    rsi24 DECIMAL(8,2),

    -- BOLL
    boll_upper DECIMAL(10,2),
    boll_mid DECIMAL(10,2),
    boll_lower DECIMAL(10,2),
    boll_width DECIMAL(8,2),
    boll_pct_b DECIMAL(8,4),

    -- KDJ
    kdj_k DECIMAL(8,2),
    kdj_d DECIMAL(8,2),
    kdj_j DECIMAL(8,2),

    -- Volume
    vol_ma5 BIGINT,
    vol_ma20 BIGINT,

    -- ATR
    atr14 DECIMAL(10,4),

    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(code, trade_date)
);

-- 4. 五维评分表
CREATE TABLE IF NOT EXISTS stock_score (
    id SERIAL PRIMARY KEY,
    code VARCHAR(10) NOT NULL,
    calc_date DATE NOT NULL,

    total_score INTEGER,
    trend_score INTEGER,
    capital_score INTEGER,
    valuation_score INTEGER,
    sentiment_score INTEGER,
    risk_score INTEGER,

    close DECIMAL(10,2),
    details JSONB,

    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(code, calc_date)
);

-- 5. AI 分析缓存表
CREATE TABLE IF NOT EXISTS ai_analysis (
    id SERIAL PRIMARY KEY,
    analysis_date DATE NOT NULL,
    session_id VARCHAR(64),

    market_outlook TEXT,
    recommended_sectors JSONB,
    recommended_stocks JSONB,
    risk_warning TEXT,
    position_sizing_advice TEXT,

    raw_prompt TEXT,
    raw_response TEXT,
    model_used VARCHAR(50),

    created_at TIMESTAMP DEFAULT NOW()
);

-- ===== 索引 =====
CREATE INDEX IF NOT EXISTS idx_daily_k_code ON stock_daily_k(code);
CREATE INDEX IF NOT EXISTS idx_daily_k_date ON stock_daily_k(trade_date);
CREATE INDEX IF NOT EXISTS idx_daily_k_code_date ON stock_daily_k(code, trade_date);

CREATE INDEX IF NOT EXISTS idx_ind_code ON stock_indicator(code);
CREATE INDEX IF NOT EXISTS idx_ind_date ON stock_indicator(trade_date);
CREATE INDEX IF NOT EXISTS idx_ind_code_date ON stock_indicator(code, trade_date);

CREATE INDEX IF NOT EXISTS idx_score_code ON stock_score(code);
CREATE INDEX IF NOT EXISTS idx_score_date ON stock_score(calc_date);
CREATE INDEX IF NOT EXISTS idx_score_total ON stock_score(total_score);

CREATE INDEX IF NOT EXISTS idx_ai_date ON ai_analysis(analysis_date);

-- ===== 注释 =====
COMMENT ON TABLE stock_basic IS '股票基础信息表';
COMMENT ON TABLE stock_daily_k IS '日K线数据表';
COMMENT ON TABLE stock_indicator IS '技术指标表（MA/MACD/RSI/BOLL/KDJ/ATR）';
COMMENT ON TABLE stock_score IS '五维评分表（趋势/资金/估值/情绪/风险）';
COMMENT ON TABLE ai_analysis IS 'AI分析结果缓存表';
