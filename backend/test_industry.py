import sys
sys.path.insert(0, 'd:/a-share-ai-decision/a股ai选股系统2026-6-6/backend')

from database import engine
from sqlalchemy import text

with engine.connect() as conn:
    # 统计有行业的股票数
    r1 = conn.execute(text("SELECT COUNT(*) FROM stock_basic WHERE industry IS NOT NULL AND industry != ''"))
    total = conn.execute(text("SELECT COUNT(*) FROM stock_basic")).fetchone()[0]
    print(f"有行业: {r1.scalar()} / 总股票: {total}")

    # 看看有哪些行业
    r2 = conn.execute(text("SELECT industry, COUNT(*) as cnt FROM stock_basic WHERE industry IS NOT NULL AND industry != '' GROUP BY industry ORDER BY cnt DESC LIMIT 10"))
    for row in r2:
        print(f"  {row[0]}: {row[1]}")
