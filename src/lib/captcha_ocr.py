#!/usr/bin/env python3
"""CAPTCHA recognition using ddddocr. Install: pip install ddddocr"""

import sys

import ddddocr

ocr = ddddocr.DdddOcr(show_ad=False)

with open(sys.argv[1], "rb") as f:
    result = ocr.classification(f.read())

print(result)
