"""
行业同步 v5 — 用 baostock（不需要东方财富 API，走自己的服务器）
"""
import os, sys, time
for k in ['HTTP_PROXY','HTTPS_PROXY','http_proxy','https_proxy']:
    os.environ.pop(k, None)

sys.path.insert(0, 'backend')
import baostock as bs
import psycopg2
import pandas as pd

print("baostock 登录...")
lg = bs.login()
print(f"  登录结果: {lg.error_code} {lg.error_msg}")

print("获取全部A股列表...")
rs = bs.query_stock_basic()
data_list = []
while rs.next():
    data_list.append(rs.get_row_data())
df = pd.DataFrame(data_list, columns=rs.fields)
print(f"获取到 {len(df)} 只股票")

# 过滤：只要A股，去掉指数
a_stocks = df[df['type'] == '1']  # type=1 是股票
print(f"其中A股: {len(a_stocks)} 只")

# 获取每只股票的行业
conn = psycopg2.connect(host='localhost', port=5432, user='postgres', password='postgres', dbname='a_stock')
cur = conn.cursor()

updated = 0
total = len(a_stocks)

for i, (_, row) in enumerate(a_stocks.iterrows()):
    full_code = row['code']  # 保留 sh.600000 格式
    short_code = full_code.replace('sh.', '').replace('sz.', '').replace('bj.', '')

    # 查询行业分类（需要完整格式）
    try:
        rs2 = bs.query_stock_industry(full_code)
        if rs2.error_code == '0':
            industries = []
            while rs2.next():
                ind_data = rs2.get_row_data()
                if ind_data[3]:  # CSRC行业分类（不是股票名）
                    industries.append(ind_data[3])
            if industries:
                # 取第一个（最相关的）行业
                ind = industries[0]
                cur.execute("UPDATE stock_basic SET industry=%s WHERE code=%s", (ind, short_code))
                if cur.rowcount > 0:
                    updated += 1
    except Exception:
        pass

    if (i+1) % 500 == 0:
        conn.commit()
        print(f"  进度 {i+1}/{total} ... {updated} 只已更新")

conn.commit()

# 查结果
cur.execute("SELECT COUNT(*) FROM stock_basic WHERE industry IS NOT NULL AND industry != ''")
after = cur.fetchone()[0]
cur.execute("SELECT code, name, industry FROM stock_basic WHERE code='002081'")
r = cur.fetchone()
print(f"\n✅ 完成！{after} 只有行业数据")
print(f"002081 行业: {r[2] if r else 'NOT FOUND'}")

# Top 行业
cur.execute("""SELECT industry, COUNT(*) as cnt FROM stock_basic
    WHERE industry IS NOT NULL AND industry != ''
    GROUP BY industry ORDER BY cnt DESC LIMIT 10""")
print('Top 10:')
for r in cur.fetchall():
    print(f'  {r[0]}: {r[1]} 只')

conn.close()
bs.logout()
