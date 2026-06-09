"""快速量化分析单只股票"""
import sys, os
sys.path.insert(0, '.')
for k in ('HTTP_PROXY','HTTPS_PROXY','http_proxy','https_proxy'):
    os.environ.pop(k,None)

import pandas as pd
import numpy as np
from services.indicator_service import calc_ma, calc_macd, calc_rsi, calc_boll, calc_kdj, calc_atr
from services.score_service import score_trend, score_capital, score_valuation, score_sentiment, score_risk
from services.akshare_service import get_stock_daily

CODE = sys.argv[1] if len(sys.argv) > 1 else '002396'
NAME = sys.argv[2] if len(sys.argv) > 2 else ''

print(f'===== {NAME} {CODE} 量化分析 =====')
print()

records = get_stock_daily(CODE, start_date='20250101', end_date='20260609', adjust='qfq')
if not records:
    print('No data')
    sys.exit(1)

df = pd.DataFrame(records)
df = df.rename(columns={
    '开盘': 'open', '收盘': 'close', '最高': 'high', '最低': 'low',
    '成交量': 'volume', '成交额': 'amount', '换手率': 'turnover',
    '涨跌幅': 'pct_change'
})

for col in ['open','close','high','low','volume','amount']:
    df[col] = pd.to_numeric(df[col], errors='coerce')
if 'turnover' in df.columns:
    df['turnover'] = pd.to_numeric(df['turnover'], errors='coerce')

df = df.dropna(subset=['close'])
print(f'数据: {len(df)} 条')

# === Compute all indicators ===
close = df['close']
mas = calc_ma(close, [5,10,20,60])
macd = calc_macd(close)
rsi = calc_rsi(close, [6,12,24])
boll = calc_boll(df)
kdj = calc_kdj(df)
vol_ma5 = df['volume'].rolling(5).mean()

indicators = {**mas, **macd, **rsi, **boll, **kdj, 'vol_ma5': vol_ma5, 'atr14': calc_atr(df)}
idx = -1
price = float(close.iloc[idx])

# === Technical Indicators ===
print()
print('----- 技术指标 -----')
print(f'收盘价: {price:.2f}')
ma5_v = float(mas['ma5'].iloc[idx])
ma10_v = float(mas['ma10'].iloc[idx])
ma20_v = float(mas['ma20'].iloc[idx])
ma60_v = float(mas['ma60'].iloc[idx])
print(f'MA5: {ma5_v:.2f} | MA10: {ma10_v:.2f} | MA20: {ma20_v:.2f} | MA60: {ma60_v:.2f}')

dif = float(macd['macd_dif'].iloc[idx])
dea = float(macd['macd_dea'].iloc[idx])
hist = float(macd['macd_hist'].iloc[idx])
cross = '金叉区' if dif > dea else '死叉区'
bar_color = '红柱' if hist > 0 else '绿柱'
print(f'MACD DIF:{dif:.4f} | DEA:{dea:.4f} | HIST:{hist:.4f} | {cross} | {bar_color}')

rsi6 = float(rsi['rsi6'].iloc[idx])
rsi12 = float(rsi['rsi12'].iloc[idx])
rsi24 = float(rsi['rsi24'].iloc[idx])
print(f'RSI 6:{rsi6:.1f} | 12:{rsi12:.1f} | 24:{rsi24:.1f}')

boll_l = float(boll['boll_lower'].iloc[idx])
boll_m = float(boll['boll_mid'].iloc[idx])
boll_u = float(boll['boll_upper'].iloc[idx])
boll_w = float(boll['boll_width'].iloc[idx])
boll_pct = float(boll['boll_pct_b'].iloc[idx])
print(f'BOLL 上:{boll_u:.2f} 中:{boll_m:.2f} 下:{boll_l:.2f} | 带宽:{boll_w:.1f}% | %B:{boll_pct:.2f}')

k = float(kdj['kdj_k'].iloc[idx])
d = float(kdj['kdj_d'].iloc[idx])
j = float(kdj['kdj_j'].iloc[idx])
kdj_status = 'J负值!严重超卖' if j<0 else ('超卖区' if j<20 else ('超买区' if j>100 else '中性'))
print(f'KDJ K:{k:.1f} | D:{d:.1f} | J:{j:.1f} | {kdj_status}')

cur_vol = float(df['volume'].iloc[idx])
vol_ma5_v = float(vol_ma5.iloc[idx])
vol_ratio = cur_vol / vol_ma5_v if vol_ma5_v > 0 else 1
print(f'成交量: {cur_vol:.0f} | 5日均量: {vol_ma5_v:.0f} | 量比: {vol_ratio:.2f}')

# Recent changes
close_arr = close.values
chg_1d = (close_arr[-1]/close_arr[-2]-1)*100 if len(close_arr)>1 else 0
chg_5d = (close_arr[-1]/close_arr[-5]-1)*100 if len(close_arr)>4 else 0
chg_10d = (close_arr[-1]/close_arr[-10]-1)*100 if len(close_arr)>9 else 0
chg_20d = (close_arr[-1]/close_arr[-20]-1)*100 if len(close_arr)>19 else 0
print(f'涨幅: 1日{chg_1d:+.1f}% | 5日{chg_5d:+.1f}% | 10日{chg_10d:+.1f}% | 20日{chg_20d:+.1f}%')

print()

# === Five Dimension Scores ===
print('===== 五维评分引擎 =====')
s_trend = score_trend(indicators, close, idx)
s_capital = score_capital(indicators, df, idx)
s_value = score_valuation(df, idx)
s_sentiment = score_sentiment(close, indicators, idx)
s_risk = score_risk(indicators, close, df, idx)
total = s_trend + s_capital + s_value + s_sentiment + s_risk

print(f'趋势  {s_trend:>3}/30  [{"#"* (s_trend//3)}{"."* (10-s_trend//3)}]')
print(f'资金  {s_capital:>3}/25  [{"#"* (s_capital//3)}{"."* (9-s_capital//3)}]')
print(f'估值  {s_value:>3}/15  [{"#"* (s_value//2)}{"."* (8-s_value//2)}]')
print(f'情绪  {s_sentiment:>3}/15  [{"#"* (s_sentiment//2)}{"."* (8-s_sentiment//2)}]')
print(f'风险  {s_risk:>3}/15  [{"#"* (s_risk//2)}{"."* (8-s_risk//2)}]')
print(f'{"─" * 32}')
print(f'总分  {total:>3}/100')

if total >= 80: grade = 'A 强烈买入'
elif total >= 65: grade = 'B 买入'
elif total >= 50: grade = 'C 中性观望'
elif total >= 35: grade = 'D 卖出回避'
else: grade = 'E 强烈回避'
print(f'评级: {grade}')

print()

# === Signal Analysis ===
print('===== 买卖信号 =====')
signals = []

# Price vs MAs
for ma_name, ma_val in [('MA5',ma5_v),('MA10',ma10_v),('MA20',ma20_v),('MA60',ma60_v)]:
    diff_pct = (price/ma_val-1)*100
    if price > ma_val:
        signals.append(('+', f'价格 > {ma_name} ({diff_pct:+.1f}%)'))
    else:
        signals.append(('-', f'价格 < {ma_name} ({diff_pct:+.1f}%)'))

# MA alignment
if ma5_v > ma10_v > ma20_v:
    signals.append(('+', '均线多头排列'))
elif ma5_v < ma10_v < ma20_v:
    signals.append(('-', '均线空头排列'))
else:
    signals.append(('=', '均线交织'))

# MACD
if dif > dea:
    signals.append(('+', 'MACD金叉区域'))
    if hist > 0: signals.append(('+', 'MACD红柱放大'))
else:
    signals.append(('-', 'MACD死叉区域'))

# RSI
if rsi12 < 20:
    signals.append(('+', f'RSI(12)={rsi12:.0f} 深度超卖，强反弹信号'))
elif rsi12 < 30:
    signals.append(('+', f'RSI(12)={rsi12:.0f} 超卖区域'))
elif rsi12 > 80:
    signals.append(('-', f'RSI(12)={rsi12:.0f} 严重超买'))
elif rsi12 > 70:
    signals.append(('-', f'RSI(12)={rsi12:.0f} 超买区域'))

# Bollinger
if boll_pct < 0:
    signals.append(('+', f'跌破布林下轨 (%B={boll_pct:.2f})，极端超卖'))
elif boll_pct < 0.1:
    signals.append(('+', f'触及布林下轨 (%B={boll_pct:.2f})'))
elif boll_pct > 0.9:
    signals.append(('-', f'触及布林上轨 (%B={boll_pct:.2f})'))

# KDJ
if j < 0:
    signals.append(('+', f'KDJ-J={j:.0f} 负值，严重超卖'))
elif j < 20 and k < 20:
    signals.append(('+', f'KDJ双底超卖 K={k:.0f} J={j:.0f}'))

# Volume
if vol_ratio < 0.5:
    signals.append(('=', f'极度缩量 (量比{vol_ratio:.2f})，卖压枯竭'))
elif vol_ratio < 0.7:
    signals.append(('=', f'缩量 (量比{vol_ratio:.2f})'))

for sig_type, msg in signals:
    icon = {'+':'GREEN ','-':'RED ','=':'YELLOW'}[sig_type]
    print(f'  [{icon}] {msg}')

print()

# === Entry Zones ===
print('===== 入场区间 =====')
print(f'布林下轨 (极端): {boll_l:.2f}')
print(f'今日低点 (支撑): 18.88')
print(f'今日收盘: {price:.2f}')
print(f'MA5 (短期压力): {ma5_v:.2f}')
print(f'MA10 (中期压力): {ma10_v:.2f}')
print()
print(f'激进入场: {max(boll_l,18.0):.1f} ~ 18.9  (布林下轨附近，左侧)')
print(f'稳健入场: 站上 MA5 ({ma5_v:.2f}) 后回踩不破')
print(f'右侧入场: 放量突破 MA10 ({ma10_v:.2f}) + MACD金叉')
print()
print(f'止损位: {max(boll_l,18.0)*0.95:.2f} (-5%)')
