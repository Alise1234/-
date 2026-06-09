import sys
sys.path.insert(0, 'd:/a-share-ai-decision/a股ai选股系统2026-6-6/backend')

from database import engine
from sqlalchemy import text
from datetime import date

with engine.connect() as conn:
    # 看 stock_daily_k 里有哪些日期
    r = conn.execute(text("SELECT DISTINCT trade_date FROM stock_daily_k ORDER BY trade_date DESC LIMIT 10"))
    rows = r.fetchall()
    print("stock_daily_k 最新日期:")
    for row in rows:
        print(f"  {row[0]}")
    
    # 今日
    today = date.today()
    print(f"\n今日: {today}")
    
    # 看 stock_basic 有多少有 industry
    r2 = conn.execute(text("SELECT COUNT(*) FROM stock_basic WHERE industry IS NOT NULL AND industry != ''"))
    print(f"有行业: {r2.scalar()}")
    
    # 统计各 industry 的数量
    r3 = conn.execute(text("SELECT industry, COUNT(*) FROM stock_basic WHERE industry IS NOT NULL AND industry != '' GROUP BY industry ORDER BY COUNT(*) DESC LIMIT 10"))
    print("\n行业分布:")
    for row in r3:
        print(f"  {row[0]}: {row[1]}")
