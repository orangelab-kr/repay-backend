import {
  InternalError,
  OPCODE,
  Webhook,
  Wrapper,
  firestore,
  getPrice,
  iamport,
} from '../tools';

import { Router } from 'express';
import dayjs from 'dayjs';

const rideCollection = firestore.collection('ride');
const userCollection = firestore.collection('users');

export default function getApiRouter(): Router {
  const router = Router();

  router.get(
    '/:rideId',
    Wrapper(async (req, res) => {
      const ride = await rideCollection.doc(req.params.rideId).get();
      const rideData = ride.data();
      if (!rideData || rideData.payment) {
        throw new InternalError(
          '이미 결제된 미결제 또는 잘못된 미결제입니다.',
          OPCODE.ERROR
        );
      }

      const diff = dayjs(rideData.end_time._seconds * 1000).diff(
        rideData.start_time._seconds * 1000,
        'minutes'
      );

      const price = await getPrice(rideData.branch, diff);
      const user = await userCollection.doc(rideData.uid).get();
      const userData = user.data();
      if (!userData) {
        throw new InternalError(
          '탈퇴한 사용자입니다. 관리자에게 문의하세요.',
          OPCODE.ERROR
        );
      }

      await Webhook.send(
        `🤔 ${userData.name}님께서 결제 페이지에 진입하였습니다. ${price}원 / ${userData.phone} / ${rideData.branch}`
      );

      res.json({
        opcode: OPCODE.SUCCESS,
        data: {
          username: userData.name,
          phone: userData.phone,
          branch: rideData.branch,
          email: '',
          price,
        },
      });
    })
  );

  router.post(
    '/:rideId',
    Wrapper(async (req, res) => {
      const { merchantUid } = req.body;
      if (!merchantUid) {
        throw new InternalError(
          '결제 오류가 발생하였습니다. 다시 시도하세요.',
          OPCODE.ERROR
        );
      }

      const ride = await rideCollection.doc(req.params.rideId).get();
      const rideData = ride.data();
      if (!rideData || rideData.payment) {
        throw new InternalError(
          '이미 결제된 미결제 또는 잘못된 미결제입니다.',
          OPCODE.ERROR
        );
      }

      const diff = dayjs(rideData.end_time._seconds * 1000).diff(
        rideData.start_time._seconds * 1000,
        'minutes'
      );

      const price = await getPrice(rideData.branch, diff);
      const user = await userCollection.doc(rideData.uid).get();
      const userData = user.data();
      if (!userData) {
        throw new InternalError(
          '탈퇴한 사용자입니다. 관리자에게 문의하세요.',
          OPCODE.ERROR
        );
      }

      const merchant = await iamport.payment.getByMerchant({
        merchant_uid: merchantUid,
        payment_status: 'paid',
      });

      if (merchant.amount !== price) {
        throw new InternalError('금액이 일치하지 않습니다.', OPCODE.ERROR);
      }

      await rideCollection.doc(req.params.rideId).update({
        cost: price,
        payment: merchantUid,
      });

      const userRides = await userCollection
        .doc(rideData.uid)
        .collection('ride')
        .where('ref', '==', `ride/${req.params.rideId}`)
        .get();

      let userRideId;
      userRides.forEach((ride) => (userRideId = ride.id));
      if (userRideId) {
        await userCollection
          .doc(rideData.uid)
          .collection('ride')
          .doc(userRideId)
          .update({ unpaied: false });
      }

      await Webhook.send(
        `🎉 ${userData.name}님께서 결제를 완료하였습니다. ${price}원 / ${userData.phone} / ${rideData.branch}`
      );

      res.json({ opcode: OPCODE.SUCCESS });
    })
  );

  return router;
}
