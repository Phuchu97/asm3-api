const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'vuongphatsteel@gmail.com',
    pass: 'mwbs gral wveo gyxt'
  }
});

const sendContactEmail = async (data) => {
  try {
    const mailOptions = {
      from: 'vuongphatsteel@gmail.com',
      to: 'vuongphatsteel@gmail.com',
      subject: `[Website] Liên hệ mới từ ${data.name} - ${data.subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 10px;">
            Liên hệ mới từ Website Thép Vượng Phát
          </h2>
          
          <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #374151; margin-top: 0;">Thông tin khách hàng:</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #4b5563; width: 120px;">Họ tên:</td>
                <td style="padding: 8px 0; color: #111827;">${data.name}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #4b5563;">Email:</td>
                <td style="padding: 8px 0; color: #111827;">${data.email}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #4b5563;">Điện thoại:</td>
                <td style="padding: 8px 0; color: #111827;">${data.phone}</td>
              </tr>
              ${data.company ? `
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #4b5563;">Công ty:</td>
                <td style="padding: 8px 0; color: #111827;">${data.company}</td>
              </tr>
              ` : ''}
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #4b5563;">Chủ đề:</td>
                <td style="padding: 8px 0; color: #111827;">${data.subject}</td>
              </tr>
            </table>
          </div>
          
          <div style="background-color: #ffffff; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
            <h3 style="color: #374151; margin-top: 0;">Nội dung tin nhắn:</h3>
            <p style="color: #111827; line-height: 1.6; white-space: pre-wrap;">${data.message}</p>
          </div>
          
          <div style="margin-top: 20px; padding: 15px; background-color: #dbeafe; border-radius: 8px;">
            <p style="margin: 0; color: #1e40af; font-size: 14px;">
              <strong>Lưu ý:</strong> Đây là email tự động từ website. Vui lòng phản hồi trực tiếp cho khách hàng qua email: ${data.email}
            </p>
          </div>
          
          <div style="margin-top: 30px; text-align: center; color: #6b7280; font-size: 12px;">
            <p>Email được gửi từ website Thép Vượng Phát</p>
            <p>Thời gian: ${new Date().toLocaleString('vi-VN')}</p>
          </div>
        </div>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    return result;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
};

module.exports = {
  sendContactEmail
};