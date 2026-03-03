import os
import sys

# Add the project dir to path
sys.path.insert(0, r"d:\Agent-4-main")

from app import extract_text_from_file
import fitz
from PIL import Image, ImageDraw, ImageFont
import io
import time

# Create dummy image with text
img = Image.new('RGB', (300, 100), color = (255, 255, 255))
d = ImageDraw.Draw(img)
d.text((10,10), "OCR TEXT FROM IMAGE", fill=(0,0,0))
img_byte_arr = io.BytesIO()
img.save(img_byte_arr, format='PNG')
img_bytes = img_byte_arr.getvalue()

# Create tiny dummy image
tiny_img = Image.new('RGB', (10, 10), color = (0, 0, 0))
tiny_byte_arr = io.BytesIO()
tiny_img.save(tiny_byte_arr, format='PNG')
tiny_bytes = tiny_byte_arr.getvalue()

# Create dummy PDF
doc = fitz.open()
page = doc.new_page()
page.insert_text((50, 50), "Hello world, this is a perfect PDF.")
rect = fitz.Rect(100, 100, 400, 200)
page.insert_image(rect, stream=img_bytes)

tiny_rect = fitz.Rect(10, 10, 20, 20)
page.insert_image(tiny_rect, stream=tiny_bytes)

pdf_bytes = doc.write()

class DummyFile:
    def __init__(self, b):
        self.b = b
        self.filename = "test.pdf"
    def read(self):
        return self.b
    def seek(self, pos):
        pass

f = DummyFile(pdf_bytes)
start = time.time()
text = extract_text_from_file(f)
end = time.time()

print(f"Extraction took: {end - start:.2f} seconds")
print("Extracted Length:", len(text))
print("Extracted Content snippet:", repr(text))


