"""
用 Windows API 临时禁用系统代理，再恢复
用于解决 WinINET 系统代理拦截 akshare 东财请求的问题
"""
import ctypes
import time
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

INTERNET_OPTION_SETTINGS_CHANGED = 39
INTERNET_OPTION_REFRESH = 37
KEY_PATH = r"Software\Microsoft\Windows\CurrentVersion\Internet Settings"

def get_proxy():
    try:
        with open(r"HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings", 'r') as f:
            content = f.read()
        return content
    except:
        return ""

def disable_proxy_temporarily():
    """用 reg 命令临时禁用系统代理（需管理员权限，降级尝试）"""
    import subprocess
    # 保存当前代理设置
    result = subprocess.run(
        ['reg', 'query', KEY_PATH, '/v', 'ProxyEnable'],
        capture_output=True, text=True
    )
    print(f"当前代理状态: {result.stdout.strip()}")

    # 尝试直接修改注册表（无需管理员）
    try:
        # 禁用代理
        subprocess.run(['reg', 'add', KEY_PATH, '/v', 'ProxyEnable', '/t', 'REG_DWORD', '/d', '0', '/f'],
                      capture_output=True)
        # 刷新设置
        ctypes.windll.wininet.InternetSetOptionW(0, INTERNET_OPTION_SETTINGS_CHANGED, None, 0)
        ctypes.windll.wininet.InternetSetOptionW(0, INTERNET_OPTION_REFRESH, None, 0)
        print("已临时禁用系统代理")
        return True
    except Exception as e:
        print(f"注册表修改失败（可能需要管理员权限）: {e}")
        return False

def restore_proxy():
    try:
        import subprocess
        subprocess.run(['reg', 'add', KEY_PATH, '/v', 'ProxyEnable', '/t', 'REG_DWORD', '/d', '1', '/f'],
                      capture_output=True)
        ctypes.windll.wininet.InternetSetOptionW(0, INTERNET_OPTION_SETTINGS_CHANGED, None, 0)
        ctypes.windll.wininet.InternetSetOptionW(0, INTERNET_OPTION_REFRESH, None, 0)
        print("已恢复系统代理")
    except:
        pass

# ============ 主程序 ============
if __name__ == "__main__":
    import akshare as ak

    if not disable_proxy_temporarily():
        print("无法禁用代理，尝试直接访问...")
    time.sleep(1)

    try:
        print("\n=== 测试1: 东财申万一级行业 ===")
        df = ak.stock_board_industry_name_em()
        print(f"成功! {len(df)} 个行业板块")
        print(df.head(5))
        board_names = df["板块名称"].tolist()

        print("\n=== 测试2: 电子板块成分股 ===")
        cons = ak.stock_board_industry_cons_em(symbol="电子元件")
        print(f"电子元件成分股: {len(cons)} 只")
        print(cons.head(3))
    except Exception as e:
        print(f"akshare 失败: {e}")

    restore_proxy()
