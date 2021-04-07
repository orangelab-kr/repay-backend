import express, { Application } from 'express';

import { logger } from '../tools';
import morgan from 'morgan';

export default function getRouter(): Application {
  const router = express();
  const logging = morgan('common', {
    stream: { write: (str: string) => logger.info(`${str.trim()}`) },
  });

  router.use(logging);
  router.use(express.json());
  router.use(express.urlencoded({ extended: true }));
  // router.use('/api', getApiRouter());

  router.get('*', (req, res) =>
    res.send(`\
<!DOCTYPE html>
<head>
  <meta charset="utf-8">
  <title>하이킥 - 미결제</title> 
</head>
<body>
<p id="status" style="font-size: x-large; margin: 0">
</p>
</body>
<script type="text/javascript" src="https://code.jquery.com/jquery-1.12.4.min.js"></script>
<script type="text/javascript" src="https://cdn.iamport.kr/js/iamport.payment-1.1.8.js"></script>
<script type="text/javascript">
  async function main() {
    const rideId = location.pathname.substr(1);
    if(rideId === 'validate') {
      setStatus('결제를 확인하고 있습니다. 잠시만 기다려주세요.');
      const { rideId, imp_success, merchant_uid, imp_uid, error_msg } = getQueries();
      if(!imp_success) return setStatus(error_msg || '오류가 발생하였습니다. 다시 시도해주세요.');
      const check = await checkPay(rideId, merchant_uid);
      if(check) return window.location.href = '/complete'; 
      return setStatus('오류가 발생하였습니다. 다시 시도해주세요.');
    }

    if(rideId === 'complete') {
      return setStatus('미결제 납부가 완료되었습니다. 감사합니다.');
    }

    if(rideId.length > 0) {
      return requestPay(rideId);
    }

    setStatus('올바르지 않은 미결제 내역입니다.');
  }

  async function checkPay(rideId, merchantUid) {
    const res = await fetch(\`/api/\${rideId}\`, {
      method: 'POST',
      body: JSON.stringify({ merchantUid }),
      headers: { 'Content-Type': 'application/json' }
    }).then((res) => res.json());

    if(res.opcode !== 0) {
      setStatus(res.message);
      return false;
    }

    return true;
  }

  function setStatus(str) {
    $('#status')[0].innerText = str;
  }

  async function requestPay(rideId) {
    setStatus('결제를 준비하고 있습니다. 잠시만 기다려주세요.');
    const info = await getInfo(rideId);
    if(info.opcode !== 0) return setStatus(info.message);
    const { username, phone, email, branch, price } = info.data;

    IMP.init('${process.env.IMP_UID}');
    IMP.request_pay({
      pg: "jtnet",
      pay_method: "card",
      merchant_uid: \`\${Date.now()}\`,
      name: branch,
      amount: price,
      buyer_name: username,
      buyer_tel: phone,
      buyer_email: email,
      custom_data: rideId,
      m_redirect_url:  \`\${location.origin}/validate?rideId=\${rideId}\`,
    }, (res) => {
      if(res.success) {
        const { success, imp_uid, merchant_uid } = res;
        window.location.href = \`/validate?rideId=\${rideId}&imp_success=\${success}&imp_uid=\${imp_uid}&merchant_uid=\${merchant_uid}\`;
      } else {
        setStatus(res.error_msg);
      }
    });
  }
  
  async function getInfo(rideId) {
    return fetch(\`/api/\${rideId}\`).then((res) => res.json());
  }

  function getQueries() {
    let vars = [], hash;
    const hashes = window.location.href.slice(window.location.href.indexOf('?') + 1).split('&');
    for(var i = 0; i < hashes.length; i++) {
      hash = hashes[i].split('=');
      vars.push(hash[0]);
      vars[hash[0]] = hash[1];
    }

    return vars;
  }

  setTimeout(main, 500);
</script>
</html>`)
  );

  return router;
}
