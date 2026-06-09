from sqlalchemy import create_engine, text
engine = create_engine('postgresql://postgres:postgres@localhost:5432/a_stock')
with engine.connect() as conn:
    tables = conn.execute(text("SELECT tablename FROM pg_tables WHERE schemaname='public'")).fetchall()
    print('数据库中的表:', [t[0] for t in tables])
    for t in tables:
        count = conn.execute(text('SELECT COUNT(*) FROM ' + t[0])).scalar()
        print(f'  {t[0]}: {count} 条')
