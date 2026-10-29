# Chienluoc — Secure Translator

Ứng dụng Next.js dịch tài liệu kỹ thuật sản xuất giày, quản lý thuật ngữ và kiểm tra bản dịch PPTX/XLSX. Bản hiện tại phục vụ sử dụng cá nhân; chưa triển khai kiểm soát quyền truy cập cho nhiều người.

## Khởi động

Yêu cầu Node.js và npm. Cài thư viện bằng `npm install`, tạo cấu hình riêng từ `.env.example`, rồi chạy `npm run dev`. Mở http://localhost:3000. Khóa dịch vụ chỉ đặt trong `.env` hoặc hộp Cài đặt; không đưa vào Git.

Để tạo bản production: `npm run build`, sau đó `npm start`. Build kiểm tra TypeScript. Có thể đặt `NEXT_BUILD_DIR` sang một thư mục riêng khi cần build trong lúc máy chủ dev đang chạy.

## Giao diện làm việc

Giao diện dùng phong cách Nothing đồng bộ với dashboard: nền giấy, tiêu đề serif, nhãn chấm và điểm nhấn đỏ. Menu trên thanh nổi mở toàn bộ công cụ; các tab hỗ trợ phím mũi tên, Home và End. Đổi công cụ vẫn giữ nội dung đang nhập và phiên xem slide. Nút mặt trăng/mặt trời chuyển sáng/tối và ghi nhớ lựa chọn trên trình duyệt. Phím Escape đóng menu hoặc cài đặt. Màu sắc và phông chữ trong nội dung slide vẫn lấy từ tài liệu gốc.

## Dịch PPTX và bỏ dịch nội dung

1. Chọn file PPTX, mở **Smart Audit (Quét phần thiếu)**.
2. Trong khung **Trực quan Slide PPTX**, chuyển đến slide cần thao tác.
3. Bấm **Bỏ dịch slide này** để bỏ toàn bộ nội dung của slide đang xem khỏi danh sách dịch. Các slide khác giữ lựa chọn hiện tại.
4. Để bỏ một vùng: bật **Quét vùng**, kéo chuột bao quanh các ô, rồi bấm **Bỏ dịch các ô này** trên bảng công cụ. Cũng có thể giữ chuột phải và kéo vùng chọn.
5. Bấm **Dịch & sửa phần chưa dịch** để chỉ xử lý những mục còn được chọn. Các ô bỏ dịch giữ nguyên văn bản và định dạng. Những chỉnh sửa thủ công đang chờ trong các ô vừa bỏ dịch cũng được loại khỏi lần xử lý này.

**Chọn tất cả** hoặc chọn lại từng mục sẽ cho phép dịch các mục đó. Khi có ô đã bỏ dịch, nút dịch ở trang chính cũng chuyển thành **Dịch phần đã chọn** và tôn trọng danh sách này, kể cả sau khi đóng Smart Audit.

Chế độ song ngữ đặt tiếng Anh trên tiếng Việt; chế độ EN-only thay nội dung trong phạm vi dịch. Chiều EN→VI được giữ khi xuất lại và tên file dùng hậu tố VI. Các lỗi chưa giải quyết được phải hiện cảnh báo hậu kiểm; không xóa câu gốc để làm mất dấu lỗi.

## Excel

- **Thay văn bản:** giữ công thức và dữ liệu số.
- **Cột song ngữ:** thêm cột bản dịch và cập nhật tham chiếu công thức trong các sheet liên quan.
- **Sheet song ngữ:** tạo tên sheet duy nhất trong giới hạn 31 ký tự; giữ vùng gộp, định dạng, kiểm tra dữ liệu và thiết lập trang in.

Cần mở và kiểm tra lại các workbook dùng macro, liên kết ngoài, công thức 3D hoặc cấu trúc Excel đặc biệt trước khi sử dụng kết quả trong sản xuất.

## Glossary trong dịch văn bản

Luồng văn bản chỉ dùng thuật ngữ đã duyệt. Các ghi chú cách dùng trong ngoặc được tách khỏi cụm cần nhận diện trước khi kiểm tra và mở rộng các tên gọi ngăn bằng dấu `/`; dữ liệu Glossary gốc được giữ nguyên. Cụm đầy đủ được ưu tiên trước cụm ngắn nằm bên trong, kể cả khi dán văn bản có khoảng trắng đặc biệt. Ví dụ: **đường vẽ chỉ → gauge marking line** được nhận từ mục **đường vẽ chỉ/đường định vị (sd cho công đoạn hệ thống)**. Bộ dịch nhận chỉ dẫn bắt buộc dùng thuật ngữ đã duyệt và kết quả được kiểm tra lại trước khi trả về giao diện.

Văn phong mặc định của AI là SOP nội bộ: câu thao tác trực tiếp, ngắn gọn, giữ đầy đủ vị trí, lý do, mục đích, số liệu, điều kiện chấp nhận và cấm đoán. Không ép giảm độ dài theo phần trăm. Tên công đoạn giữ dạng danh từ; trong câu cho phép các dạng động tác đã duyệt, như **Bottom attaching → Attach the outsole**.

Câu kiểm tra cho công nhân phải dùng **Check if + chủ thể + động từ + điều kiện đầy đủ**, ví dụ **Check if the stitching line is straight.** Khi rút gọn phải giữ `if`, không đổi thành cụm danh từ như **Check stitching line**. Quy tắc dùng chung cho Văn bản và các yêu cầu AI của Smart Audit.

Tên lỗi **đứt chỉ** theo Glossary là **Broken thread**. Các nhãn/danh sách lỗi được chuẩn hóa để không dùng lẫn `breaking` và `breakage` cho cùng lỗi này. Quy tắc dựa vào nguồn VI và mục đã duyệt; không thay các lỗi khác như gãy kim, nứt liệu hoặc thông số lực đứt. Câu kiểm tra có thể dùng dạng ngữ pháp **Check if the threads are broken.**; `fraying` vẫn là lỗi riêng.

Hai câu trong ảnh tham chiếu nội bộ của người dùng được dùng làm mẫu ban đầu. Với câu đã duyệt trùng nội dung, ứng dụng dùng lại nguyên văn, không gọi AI. Với câu mới, mẫu chỉ hướng dẫn văn phong; không tự sao chép thông số hoặc lỗi từ mẫu. Bạn có thể sửa bản dịch rồi bấm **Lưu mẫu nội bộ** để duyệt và lưu câu vào bảng `internal_sop_examples` trong SQLite. Câu đã lưu được ưu tiên hơn mẫu ban đầu; thay số liệu hoặc điều kiện sẽ không được coi là trùng. Cần sao lưu SQLite để giữ kho mẫu này.

Dán văn bản chỉ chèn một lần. Khi sửa nguồn, đổi chiều dịch hoặc xóa, yêu cầu trước bị hủy và phản hồi cũ không được ghi đè nội dung mới. Nhãn phần trăm chỉ thể hiện độ khớp Glossary; điểm kiểm tra tự động không đồng nghĩa với duyệt nghiệp vụ.

Khi Smart Audit dịch các ô được chọn bằng Gemini hoặc Antigravity, các mẫu nội bộ đã lưu được chuyển vào chỉ dẫn văn phong, kể cả khi dịch lại. Chỉ mẫu phù hợp ngữ cảnh được đưa vào; số liệu và điều kiện phải lấy từ nội dung slide hiện tại. Smart Audit không tự thay bản dịch bằng mẫu đã lưu, và các bản dịch sẵn có hoặc chỉnh sửa thủ công vẫn được xử lý theo lựa chọn hiện tại. Luồng sửa không lấy lại cache dịch máy từ lần chạy trước, nhưng vẫn gộp những câu trùng trong cùng lần xử lý.

## Kiểm soát nhất quán thuật ngữ ở backend

Mỗi lượt dịch PPTX chốt một snapshot Glossary **đã duyệt**, có mã phiên bản. Thuật ngữ đang review vẫn có thể xuất hiện trong kho gợi ý Smart Audit nhưng không được khóa thành chuẩn bắt buộc. Backend chọn cách dùng theo công đoạn trên từng slide; các mục cùng mức ưu tiên và ngữ cảnh nhưng khác bản dịch được báo xung đột, không chọn ngẫu nhiên. Bộ nhớ dịch và cache phân biệt công đoạn; cache còn phân biệt phiên bản glossary để không dùng lại kết quả theo chuẩn cũ.

Gemini và Antigravity nhận toàn bộ thuật ngữ liên quan của từng gói, không còn giới hạn 35 mục. Cùng kế hoạch thuật ngữ được chuyển qua lượt dịch đầu, lượt sửa và engine dự phòng. Lượt sửa glossary có giới hạn; Smart Audit dùng lượt sửa hiện có để tránh gọi lặp thêm. Dạng ngữ pháp đã cho phép và cấu trúc **Check if** được giữ khi chuẩn hóa. Các câu VI khác nhau vẫn được kiểm tra chung theo khái niệm glossary, không chỉ so câu trùng nguyên văn.

Sau đóng gói và hậu kiểm, backend đối chiếu bản dịch với XML thực tế rồi trả báo cáo tại `postFlight.terminologyConsistency` và `auditReport.terminologyConsistency`. Luồng Văn bản dùng cùng bộ chọn thuật ngữ và trả `terminologyConsistency`. Báo cáo nhóm lỗi theo khái niệm, kèm ID đoạn, slide và cờ nội dung được bảo vệ. Xuất lại file sau chỉnh sửa cũng kiểm tra glossary; các phản hồi tải trực tiếp có header `X-Terminology-Conflict-Count`. Lỗi chưa xử lý khiến `postFlight.passed=false`; không gộp lỗi thuật ngữ vào số đoạn chưa dịch.

Phần bỏ dịch và bản EN có sẵn được giữ theo phạm vi người dùng chọn. Bản EN có nguồn VI vẫn được rà và báo lỗi, không tự sửa vùng được bảo vệ. `unitsWithoutApprovedTerms` và `englishOnlyUnitsWithoutSource` thể hiện giới hạn kiểm chứng; `passed` chỉ có nghĩa không phát hiện lỗi trong phạm vi có cơ sở đối chiếu, không phải chứng nhận đúng toàn bộ nội dung. AI không tự duyệt hoặc ghi thêm thuật ngữ vào Glossary. Không thêm giao diện cho cơ chế này.

### Ghép nhóm model và kiểm tra chất lượng câu

Backend theo dõi nhóm model riêng cho từng ngôn ngữ, rồi ghép theo mã model và lần xuất hiện. Các tiêu đề `For …`, `Đối với …` và `With cutting die …` có cùng mã được đặt trong cùng phạm vi đối chiếu. Khối EN ở trên và VI ở dưới không còn làm các bước chung bị gán nhầm sang nhóm model cuối của phía EN. Số bước lặp không được dùng để ghép chéo nhóm; câu cụt như `1. Check` bị loại khỏi ứng viên ghép cặp. Cách này cũng áp dụng cho khối song ngữ nằm trong một đoạn XML có xuống dòng.

`ALREADY_TRANSLATED` chỉ mô tả việc đã có nội dung ngôn ngữ đích. Backend trả riêng `qualityStatus`, `qualityIssues` trên từng đoạn và `translationQuality` trong báo cáo Smart Audit/hậu kiểm. Bộ quy tắc cảnh báo câu cụt, thiếu `Check if`, điều kiện thiếu động từ rõ ràng, lệch số đo/dung sai có dấu, thiếu giới hạn tối đa và tiêu đề model tự thêm thao tác `cutting die`. Những cảnh báo này xuất hiện trong nhóm chất lượng hiện có, không tự chọn dịch lại bản EN được giữ nguyên. Việc chỉ kiểm tra bằng quy tắc chưa chứng nhận tương đương ngữ nghĩa; báo cáo ghi rõ `semanticAssessment: not_performed`.

Khi người dùng chủ động chọn đoạn EN đang có cảnh báo và backend tìm được nguồn VI tương ứng, lượt sửa sử dụng nguồn VI để thay đúng đoạn EN đó, kể cả ở chế độ song ngữ; không chèn thêm bản EN trùng hoặc thay đổi đoạn VI ngoài phạm vi chọn. Bản dịch AI mới có lỗi nhận diện được sẽ được thử sửa thêm một lượt có giới hạn. Lỗi vẫn còn làm hậu kiểm trả cảnh báo; tải trực tiếp có header `X-Translation-Quality-Issue-Count`. Mẫu đã duyệt và sửa tay không bị ép viết lại chỉ để đổi văn phong.

## Kiểm thử

- `npm run typecheck`: kiểm tra TypeScript.
- `npm test`: chạy bộ kiểm thử với thư mục tạm riêng cho từng tiến trình; không ghi vào dữ liệu ứng dụng. Các yêu cầu mạng trong unit test bị chặn và phải giả lập rõ ràng.
- `npm test -- tests/review_fixes.test.mjs`: chạy nhóm hồi quy về lưu dữ liệu, công thức, bảo mật khóa, dọn file và phạm vi dịch.

Dùng lệnh `npm test` để nhận cơ chế cách ly; không chạy trực tiếp bộ test với dữ liệu vận hành. Các test cần tài liệu mẫu đọc thư mục `Database` nhưng không sao chép ảnh. Bài kiểm tra MarkItDown có thể bỏ qua nếu không có tài liệu mẫu phù hợp.

## Dữ liệu và khôi phục

SQLite trong `data/database.sqlite` là nguồn dữ liệu chính. File `data/database.json` là bản sao tham khảo đã loại khóa API, không phải bản sao đầy đủ để khôi phục khóa dịch vụ. Mỗi thao tác chỉ lưu các bản ghi/trường thay đổi, để các tiến trình không ghi đè toàn bộ dữ liệu của nhau.

Trước khi sao lưu thủ công, dừng ứng dụng rồi sao lưu cả thư mục `data` (gồm SQLite và các file WAL/SHM nếu còn), hoặc dùng chức năng backup của SQLite. Dữ liệu nhạy cảm và bản sao lưu phải ở ngoài `public`. File upload lỗi được dọn dù đang chọn giữ tài liệu lâu dài.

Nếu dịch vụ dịch gặp lỗi hoặc hết hạn mức, kiểm tra cài đặt engine và cảnh báo hậu kiểm. Kết quả kiểm thử tự động không thay thế việc duyệt nội dung kỹ thuật trước khi phát hành tài liệu.
