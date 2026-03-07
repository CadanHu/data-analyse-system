import os
import time
import requests
import json
from pathlib import Path

# === Configuration ===
# 尝试从 backend/.env 自动加载 Token
def load_token():
    # 1. 优先尝试环境变量
    token = os.getenv("MINERU_API_KEY")
    if token and token != "your_token_here":
        return token
    
    # 2. 尝试读取 backend/.env
    env_path = Path("backend/.env")
    if env_path.exists():
        with open(env_path, "r") as f:
            for line in f:
                if line.startswith("MINERU_API_KEY="):
                    return line.split("=")[1].strip().strip('"').strip("'")
    
    # 3. 兜底
    return "your_token_here"

TOKEN = load_token()
# We use a known existing file or the one you just tried to upload.
# Looking for a PDF in the uploads folder
UPLOAD_DIR = Path("uploads")
test_files = list(UPLOAD_DIR.glob("*.pdf"))
FILE_PATH = test_files[0] if test_files else Path("uploads/test.pdf")
BASE_URL = "https://mineru.net/api/v4"

def test_mineru_flow():
    if not Path(FILE_PATH).exists():
        print(f"❌ Error: Could not find test file {FILE_PATH}")
        print("Please ensure a PDF exists in the 'uploads' directory.")
        return

    print(f"🚀 Testing MinerU v4 with file: {FILE_PATH}")
    
    headers = {
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "application/json"
    }

    # 1. Apply for upload URL
    print(f"📡 1. Requesting upload URL for: {FILE_PATH.name}")
    payload = {
        "files": [{"name": FILE_PATH.name, "data_id": f"test_{int(time.time())}"}],
        "model_version": "vlm"
    }
    
    try:
        resp = requests.post(f"{BASE_URL}/file-urls/batch", headers=headers, json=payload, timeout=15)
        if resp.status_code != 200:
            print(f"❌ Request failed: {resp.status_code}, {resp.text}")
            return
        
        res_data = resp.json()
        if res_data.get("code") != 0:
            print(f"❌ Logic Error: {res_data.get('msg')}")
            return

        batch_id = res_data["data"]["batch_id"]
        upload_url = res_data["data"]["file_urls"][0]
        print(f"✅ BatchID obtained: {batch_id}")

        # 2. Upload file (PUT)
        print(f"📤 2. Uploading binary stream...")
        with open(FILE_PATH, "rb") as f:
            up_resp = requests.put(upload_url, data=f, timeout=120)
            if up_resp.status_code != 200:
                print(f"❌ Upload failed: {up_resp.status_code}, {up_resp.text}")
                return
        print("✅ Upload successful")

        # 3. Polling result
        print(f"⏳ 3. Polling for results (Max 5 mins)...")
        for i in range(60):
            time.sleep(5)
            res_resp = requests.get(f"{BASE_URL}/extract-results/batch/{batch_id}", headers=headers, timeout=15)
            result = res_resp.json()
            
            if result.get("code") != 0:
                print(f"❌ Polling exception: {result.get('msg')}")
                break
                
            task_list = result["data"].get("extract_result", [])
            if not task_list:
                print("... waiting for task list ...")
                continue
                
            task = task_list[0]
            state = task.get("state")
            print(f"--- Iteration {i+1}: State = {state}")

            if state == "done":
                print("🎉 Extraction Complete!")
                print(f"📦 Fields returned: {list(task.keys())}")
                
                # Check for direct text
                for field in ["content", "markdown", "text"]:
                    val = task.get(field)
                    if val:
                        print(f"📝 Found direct text in '{field}' field!")
                        print(f"Preview: {val[:300]}...")
                        return

                # If no direct text, check ZIP
                zip_url = task.get("full_zip_url")
                if zip_url:
                    print(f"🔗 ZIP URL detected: {zip_url}")
                    print("📡 Attempting download with Auth headers...")
                    z_resp = requests.get(zip_url, headers=headers, timeout=30)
                    print(f"📥 Download HTTP Status: {z_resp.status_code}")
                    print(f"📥 Content-Type: {z_resp.headers.get('Content-Type')}")
                    
                    if "text/html" in z_resp.headers.get("Content-Type", ""):
                        print("⚠️ WARNING: Downloaded HTML instead of ZIP.")
                        print("📄 HTML Preview:")
                        print(z_resp.text[:300])
                    elif z_resp.status_code == 200:
                        print(f"✅ 成功获取二进制流，大小: {len(z_resp.content)} 字节")
                        
                        # === 新增：解压并读取内容 ===
                        print("📦 正在解压并读取 Markdown 内容...")
                        import zipfile
                        import io
                        with zipfile.ZipFile(io.BytesIO(z_resp.content)) as z:
                            md_files = [n for n in z.namelist() if n.endswith('.md')]
                            if md_files:
                                # 优先读取正文 md
                                target_md = md_files[0]
                                print(f"📄 找到 Markdown 文件: {target_md}")
                                with z.open(target_md) as f:
                                    content = f.read().decode('utf-8')
                                    print("\n" + "="*50)
                                    print("📝 解析结果内容展示 (前 1000 字):")
                                    print("-" * 50)
                                    print(content[:1000])
                                    print("-" * 50)
                                    if len(content) > 1000:
                                        print(f"... (还有 {len(content)-1000} 字未展示)")
                                    print("="*50 + "\n")
                            else:
                                print("❌ 错误: 压缩包内没有找到 .md 文件")
                                print(f"所有文件列表: {z.namelist()}")
                        # ==========================
                    return 
                
                print("❓ No content and no zip_url found.")
                return
            elif state == "failed":
                print(f"❌ Extraction failed on MinerU side: {task.get('err_msg')}")
                return
        print("⏰ Timed out after 5 minutes.")

    except Exception as e:
        print(f"❌ Execution Exception: {str(e)}")

if __name__ == "__main__":
    test_mineru_flow()
