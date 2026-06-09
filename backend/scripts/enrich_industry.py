"""
批量补充 stock_basic.industry 字段 - 快速版
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

# 关键：在 akshare 导入之前设置代理
os.environ["HTTP_PROXY"] = "http://127.0.0.1:7897"
os.environ["HTTPS_PROXY"] = "http://127.0.0.1:7897"

import akshare as ak
import requests

# 替换 akshare 默认 session 的代理
_s = requests.Session()
_s.proxies = {"http": "http://127.0.0.1:7897", "https": "http://127.0.0.1:7897"}
ak.http.bulk_set_proxies = lambda: None

from database import SessionLocal, engine
from models import StockBasic
from sqlalchemy import text
import time

def enrich_industry_fast():
    print("[行业补充] 开始获取行业数据...")
    print(f"  代理: http://127.0.0.1:7897")

    # 测试连通性
    try:
        test = requests.get("http://push2.eastmoney.com/api/qt/clist/get", timeout=5, proxies={"http": "http://127.0.0.1:7897", "https": "http://127.0.0.1:7897"})
        print(f"  网络测试: {test.status_code}")
    except Exception as e:
        print(f"  网络测试失败: {e}")

    code_to_industry: dict[str, str] = {}

    try:
        board_df = ak.stock_board_industry_name_em()
        print(f"  找到 {len(board_df)} 个行业板块")
        board_names = board_df['板块名称'].tolist()
    except Exception as e:
        print(f"  获取板块名称失败: {e}")
        import traceback; traceback.print_exc()
        return

    for i, board_name in enumerate(board_names):
        try:
            cons_df = ak.stock_board_industry_cons_em(symbol=board_name)
            for _, cons_row in cons_df.iterrows():
                code = str(cons_row.get("代码", "")).strip()
                if code and len(code) == 6:
                    code_to_industry[code] = board_name
            if (i + 1) % 10 == 0:
                print(f"  进度 {i+1}/{len(board_names)}: {board_name}")
            time.sleep(0.15)
        except Exception as e:
            print(f"  板块 [{board_name}] 失败: {e}")
            time.sleep(0.3)
            continue

    print(f"\n共映射 {len(code_to_industry)} 只股票行业")

    db = SessionLocal()
    try:
        all_stocks = db.query(StockBasic).all()
        updated = 0
        for stock in all_stocks:
            code = stock.code.zfill(6)
            if code in code_to_industry and not stock.industry:
                stock.industry = code_to_industry[code]
                updated += 1
        db.commit()
        print(f"写入数据库完成，更新 {updated} 条")

        with engine.connect() as conn:
            r = conn.execute(text(
                "SELECT industry, COUNT(*) as cnt FROM stock_basic "
                "WHERE industry IS NOT NULL AND industry != '' "
                "GROUP BY industry ORDER BY cnt DESC LIMIT 20"
            ))
            print("\n行业分布 Top20:")
            for row in r:
                print(f"  {row[0]}: {row[1]} 只")

    except Exception as e:
        print(f"数据库写入失败: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    enrich_industry_fast()
