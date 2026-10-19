# BẢN TÓM TẮT DỰ ÁN (PROJECT COMPACT SUMMARY)
**Thời gian tạo:** 2026-10-19 11:52 (GMT+7)  
**Dự án:** Chienluoc - Phần mềm Dịch thuật Tài liệu Kỹ thuật Sản xuất Giày (PPTX / XLSX / PDF)  
**Thư mục dự án:** `C:\Users\User\Desktop\Chienluoc`  
**Máy chủ cục bộ:** `http://localhost:3000` (Dev server đang hoạt động)

---

## 1. Yêu cầu của người dùng & Các hạng mục đã hoàn thành

### 1.1. Cập nhật Model AI Gemini
- **Yêu cầu:** Chỉ sử dụng `gemini-3.5-flash-lite` và `gemini-3.1-flash-lite` (không dùng Gemini 3.8 Flash).
- **Đã xử lý:** Cập nhật đồng bộ trong `.env`, `services/translation/gemini.ts`, `services/translation/gemini/rate-limiter.ts`, `app/api/translate/route.ts`, `app/api/documents/translate-pptx/route.ts`.

### 1.2. Giám sát thông số AI Studio (RPM / RPD / Tokens)
- **Yêu cầu:** Hiển thị thông số RPM và hạn mức AI Studio khi dịch, đặc biệt đưa vào phần dịch PPTX.
- **Đã xử lý:** 
  - Tạo API route `/api/gemini/quota` theo dõi RPM, RPD, TPM theo thời gian thực.
  - Xây dựng component `components/AiStudioTelemetry.tsx`.
  - Tích hợp trực tiếp vào thanh điều khiển của `components/PptxTranslator.tsx` và trang chính.

### 1.3. Tinh chỉnh giao diện dịch PPTX
- **Yêu cầu:** Xóa chữ "ISQ" trên tiêu đề/nút dịch PPTX.
- **Đã xử lý:** Đã xóa nhãn ISQ trên giao diện người dùng `components/PptxTranslator.tsx`.

### 1.4. Trực quan hóa & Xem trước Slide thực tế chuẩn PowerPoint (1:1 Slide Visual Review)
- **Yêu cầu:** 
  1. Review slide trực diện như đang mở trong PowerPoint thực tế để kiểm tra chất lượng bản dịch.
  2. Bố cục 1:1 bảo toàn đầy đủ màu sắc các banner (banner cam tiêu đề, banner xanh cyan chất lượng/quy trình, khối xanh lá GOOD, khối đỏ NO GOOD, các viền bảng).
  3. **Chính sách xóa ảnh Zero-Image tuyệt đối ("xóa những ảnh có ở trong slide ra thôi"):** Ảnh sản phẩm giày hoàn toàn bị xóa/ẩn khỏi khung xem trước, để lại các khoảng trống bố cục tự nhiên y như slide thực tế khi xóa ảnh.
- **Đã xử lý:**
  - **Bóc tách bảng OpenXML (`<a:tbl>`) thành các ô (`<a:tc>`) chi tiết:** Trích xuất chính xác tọa độ từng cột (`<a:gridCol>`) và hàng (`<a:tr>`), màu nền fill (`<a:solidFill>`), viền bảng (`border`), căn lề (`algn="ctr"` / `algn="l"`), cỡ chữ và in đậm (`b="1"`).
  - **Giữ trọn màu sắc đặc trưng:** Banner cam `#FF8810`, banner tiêu đề bảng `#00B0F0`, khối `#92D050` (GOOD), khối `#FF0000` (NO GOOD) và các viền đen phân tách ô bảng.
  - **Khung vẽ Slide Sheet chuẩn PowerPoint:** Nền trắng thanh lịch (`#FFFFFF` hoặc màu nền slide gốc), đổ bóng slide chuyên nghiệp thay vì nền đen radar sci-fi.
  - **Chế độ Zero-Image mặc định:** Xóa sạch ảnh kỹ thuật trong chế độ xem trước (để lại khoảng trắng chân thực); kèm nút bật/tắt "Hiện khung ảnh" khi cần kiểm tra tọa độ.
  - **Xem bản dịch tức thì:** Hỗ trợ xem 🇬🇧 **Bản dịch EN**, 🇻🇳 **Nguyên bản VI**, hoặc 🔀 **Song ngữ đối chiếu**; nhấp chuột sửa trực tiếp bản dịch ngay trên slide.

---

## 2. Chi tiết các tệp mã nguồn quan trọng đã tạo / chỉnh sửa

| Tệp tin | Vai trò & Nội dung thay đổi |
| :--- | :--- |
| `services/translation/smart-detector.ts` | Bổ sung các thuộc tính trực quan `fill`, `textColor`, `fontSizePt`, `isBold`, `align`, `border`, `tableRow`, `tableCol` vào `SlideVisualElement` và `backgroundColor` vào `SlideVisualLayout`. |
| `services/translation/pptx-smart-audit.ts` | Phân tích OpenXML trích xuất tọa độ `<a:xfrm>`, bóc tách bảng thành các ô cell, chuyển đổi mã màu `<a:srgbClr>` / `<a:schemeClr>`, ánh xạ chính xác đoạn văn vào ô chứa và trả về `visualLayouts`. |
| `components/SmartAuditSlideCanvas.tsx` | Khung xem trước slide chuẩn PowerPoint 1:1, tự động áp dụng màu nền, viền bảng, căn giữa tiêu đề, ẩn/xóa ảnh Zero-Image và hỗ trợ chỉnh sửa inline. |
| `components/SmartAuditModal.tsx` | Tích hợp tab "Trực quan Slide PPTX" vào modal kiểm tra chất lượng Smart Audit. |
| `components/AiStudioTelemetry.tsx` | Thanh giám sát thông số RPM, RPD và trạng thái API Gemini thời gian thực. |
| `components/PptxTranslator.tsx` | Tích hợp AI Studio Telemetry, cập nhật tên model và xóa nhãn ISQ. |
| `tests/pptx_visual_mapping.test.mjs` | Bộ kiểm thử tự động kiểm tra trích xuất ô bảng, tọa độ 1:1 và đảm bảo chính sách Zero-Image an toàn tuyệt đối. |

---

## 3. Trạng thái kiểm thử & Hệ thống

- **TypeScript Compilation:** `npx.cmd tsc --noEmit` đạt **0 lỗi**.
- **Unit Test Suite:** Toàn bộ **280/280 tests** đều vượt qua (`Pass 280, Fail 0, Skipped 0`).
- **Dev Server:** Đang chạy tại `http://localhost:3000` (HTTP 200 OK).

---

## 4. Các tệp trọng tâm để tiếp tục trong IDE

1. Giao diện canvas CapCut: [components/SmartAuditSlideCanvas.tsx](file:///C:/Users/User/Desktop/Chienluoc/components/SmartAuditSlideCanvas.tsx)
2. Bộ giải thuật bóc tách tọa độ OpenXML: [services/translation/pptx-smart-audit.ts](file:///C:/Users/User/Desktop/Chienluoc/services/translation/pptx-smart-audit.ts#L48-L245)
3. Bộ kiểm thử ánh xạ không gian: [tests/pptx_visual_mapping.test.mjs](file:///C:/Users/User/Desktop/Chienluoc/tests/pptx_visual_mapping.test.mjs)
