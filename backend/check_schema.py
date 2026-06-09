import sys
sys.path.insert(0, 'd:/a-share-ai-decision/a股ai选股系统2026-6-6/backend')
from database import engine
from sqlalchemy import text

with engine.connect() as conn:
    # stock_basic 字段
    r = conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name = 'stock_basic' ORDER BY ordinal_position"))
    print("stock_basic 字段:")
    for row in r:
        print(f"  {row[0]}")

    # stock_basic 示例
    r2 = conn.execute(text("SELECT * FROM stock_basic LIMIT 3"))
    cols = [desc[0] for desc in r2.context.__cursor__.description] if hasattr(r2, 'context') else []
    print("\nstock_basic 示例:")
    sample = conn.execute(text("SELECT code, name, market, list_date FROM stock_basic LIMIT 3")).fetchall()
    for row in sample:
        print(f"  {row}")

    # market 字段分布
    r3 = conn.execute(text("SELECT market, COUNT(*) FROM stock_basic GROUP BY market ORDER BY COUNT(*) DESC"))
    print("\nmarket 分布:")
    for row in r3:
        print(f"  {row[0]}: {row[1]}")
