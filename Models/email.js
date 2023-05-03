const ElasticEmail = require('@elasticemail/elasticemail-client');
const defaultClient = ElasticEmail.ApiClient.instance;
const apikey = defaultClient.authentications['apikey'];
const API_URL = 'http://localhost:4000/';
apikey.apiKey = "BB92C606AE9A11E6ED69415E75A91D77775CEDA058B03CBD8F80D0065D822E529078805AC4CB8619DF0953F4A84B64C1";
const api = new ElasticEmail.EmailsApi();
const email = (data) => {
    return ElasticEmail.EmailMessageData.constructFromObject({
        Recipients: [
          new ElasticEmail.EmailRecipient(`${data.email}`)
        ],
        Content: {
          Body: [
            ElasticEmail.BodyPart.constructFromObject({
              ContentType: "HTML",
              charset: 'utf-8',
              Content: `
              <h1>Xin chào ${data.name_order}</h1>
              <h5>Phone number : 0${data.phone}</h5>
              <h5>Address : ${data.address}</h5>
              <table>
                <thead>
                    <tr>
                        <th style="text-align: center;min-width: 250px">Tên Sản Phẩm</th>
                        <th style="text-align: center;min-width: 250px">Hình Ảnh</th>
                        <th style="text-align: center;min-width: 120px">Giá</th>
                        <th style="text-align: center;min-width: 120px">Số Lượng</th>
                        <th style="text-align: center;min-width: 120px">Thành Tiền</th>
                    </tr>
                </thead>
                <tbody>
                ${
                    data.list_cart.map((obj) => {
                        return (
                            `<tr>
                                <td style="text-align: center;">${obj.name_product}</td>
                                <td style="text-align: center;"><img style="width: 100px;" src="https://cdn2.cellphones.com.vn/x358,webp,q100/media/catalog/product/v/_/v_ng_18.png" alt="product"/></td>
                                <td style="text-align: center;">${obj.price_product}</td>
                                <td style="text-align: center;">${obj.quantity}</td>
                                <td style="text-align: center;">${obj.quantity * obj.price_product}</td>
                            </tr>`
                        )
                    })
                }
                </tbody>
            </table>
            <div><h3>Tổng thanh toán : ${data.total} VND</h3>
            <h3>Cảm ơn bạn đã tin tưởng và ủng hộ chúng tôi!</h3></div>
            `
            
            })
          ],
          Subject: "PhuChu Entertaiment",
          From: "phuchu199749@gmail.com"
        }
    });
}


module.exports = {
    api,
    email
}