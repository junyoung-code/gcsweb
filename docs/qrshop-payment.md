# QRshop v2 결제 프론트

실제 상점 경로(`/QRshop/@slug` 또는 `?storeSlug=...`)는 v2 API와 PortOne browser-sdk 0.1.3을 사용한다. 상점 없는 `/QRshop` QA 경로는 기존 Mock만 사용하며 API 실패를 Mock으로 대체하지 않는다.

## 계약과 흐름

- `POST /api/v2/qrshop/orders?storeSlug=...`: `termsAgreed`, `items[{productId, optionId, quantity}]`만 전송한다. 응답의 `orderId`, `paymentAmount`, `payment{storeId,channelKey,orderName}`을 사용한다. 생성 응답의 `orderNo`는 미결제 화면에 표시하지 않는다.
- 주문별 guestToken과 결제 설정은 `gcs:qrshop:payment:<orderId>` sessionStorage에 저장한다. 토큰은 URL, SDK 인자, 공개 주문 모델, 로그에 넣지 않는다. 다른 주문/상점의 토큰을 재사용하지 않는다.
- 저장 사전 점검 실패 시 주문을 생성하지 않는다. 생성 후 실제 저장 실패 시 결제를 시작하지 않고 안내한다. 토큰은 서버에서 재발급받는 계약이 없어 저장 실패·삭제·다른 탭 진입 시 해당 주문의 자동 복구는 불가하다.
- 결제 버튼은 서버 `verify` + `GET`으로 기존 결제를 먼저 확인한 뒤, 미결제/실패 주문만 SDK를 연다. 금액은 GET 응답을 사용하고 paymentId는 서버 orderId를 그대로 사용한다. 카드 결제와 KRW를 사용한다.
- SDK 반환/예외/취소만으로 결제 성공·실패를 확정하지 않는다. `POST /orders/<orderId>/payment/verify`와 `GET /orders/<orderId>`에 `X-Guest-Token`을 전달하여 결과를 확인한다. 품절409 뒤에도 GET의 `failureCode`, `failureMessage`, 품절 항목을 보존한다.
- SDK의 리다이렉트는 동일 출처 `/QRshop/result?orderId=...&storeSlug=...`로 복귀하며, 결과 페이지가 세션을 읽어 다시 서버 검증·조회한다. 쿼리의 SDK 결과는 신뢰하지 않는다.
- PAID와 서버 주문번호가 있을 때만 완료 화면을 표시한다. PENDING, FAILED, CANCELED, REFUND_PENDING은 미결제·실패·취소·환불 확인 분기로 표시한다. 전체 결과 디자인은 후속 작업이다.
- SDK 후 검증 통신 오류는 결제창을 재실행하지 않고 상태 확인만 재시도한다. 처리 중 중복 클릭/화면 내 이탈을 막고 새로고침·탭 닫기에는 브라우저 이탈 경고를 사용한다. 주문/상점 전환·언마운트된 요청은 화면과 라우팅을 갱신하지 않으며 사전 조회 대기 중 이탈하면 SDK를 열지 않는다.

## 한계

서버 계약은 `git show upstream/main:app/api/v2/qrshop/orders/...`로 읽었으며 서버 코드·환경·Prisma를 통합하지 않았다. 따라서 대상 서버에 v2 API와 결제 설정이 준비되어야 실제 연동이 동작한다. POST 응답 유실 시 서버 주문의 존재를 복구할 계약은 없으며 자동으로 POST를 반복하지 않는다. 세션은 같은 탭에서 유지하고 탭 종료 시 사라진다. 새 탭 복제 등 브라우저의 sessionStorage 복사 정책은 브라우저에 따른다.

검증은 fetch와 SDK 대체 테스트로만 수행한다. 실제 승인·청구·취소·환불, 실제 서버·운영 데이터, 브라우저·build 검증은 수행하지 않는다.
