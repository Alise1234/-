import os
print("HTTP_PROXY:", repr(os.environ.get("HTTP_PROXY")))
print("HTTPS_PROXY:", repr(os.environ.get("HTTPS_PROXY")))
import sys
print("sys.argv:", sys.argv)
