import smtplib
from email.mime.text import MIMEText
from email.header import Header
from config import SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM

def send_verification_email(to_email: str, code: str):
    """发送注册验证码邮件"""
    # [重要] 无论邮件发送成功与否，都在终端打印出大框，方便开发调试
    print("\n" + "★"*60)
    print(f"🔑 验证码 (Verification Code): {code}")
    print(f"📧 目标邮箱 (Target Email):    {to_email}")
    print("★"*60 + "\n")

    if not SMTP_USER or not SMTP_PASSWORD:
        print(f"⚠️ [EMAIL SKIP] SMTP 未配置，请直接使用上方验证码。")
        return False

    # 邮件内容
    message = MIMEText(f'''
    <html>
        <body>
            <h2 style="color: #3b82f6;">DataPulse AI 验证码</h2>
            <p>您好！感谢您注册 DataPulse AI 智能数据分析助理。</p>
            <p>您的注册验证码为：</p>
            <div style="background: #f3f4f6; padding: 20px; font-size: 24px; font-weight: bold; text-align: center; color: #06d6a0; border-radius: 10px; margin: 20px 0;">
                {code}
            </div>
            <p>该验证码在 10 分钟内有效。如果不是您本人操作，请忽略此邮件。</p>
            <hr />
            <p style="font-size: 12px; color: #9ca3af;">此邮件为系统自动发送，请勿回复。</p>
        </body>
    </html>
    ''', 'html', 'utf-8')

    message['From'] = Header(f"DataPulse AI <{SMTP_FROM}>")
    message['To'] = Header(to_email)
    message['Subject'] = Header("DataPulse AI 注册验证码", 'utf-8')

    try:
        # 根据端口选择加密方式
        if SMTP_PORT == 465:
            server = smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=10)
        else:
            server = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10)
            server.starttls()
        
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.sendmail(SMTP_FROM, [to_email], message.as_string())
        server.quit()
        print(f"✅ [EMAIL SUCCESS] 验证码已发送至: {to_email}")
        return True
    except Exception as e:
        print(f"❌ [EMAIL ERROR] 发送失败: {str(e)}")
        print(f"💡 [FALLBACK] 验证码已降级输出至终端: {code}")
        return False
