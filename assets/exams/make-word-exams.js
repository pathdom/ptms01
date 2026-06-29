const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType } = require('docx');
const fs = require('fs');
const path = require('path');

const EXAMS = [
  {
    file: 'hanh-chinh.docx',
    department: 'Hành chính',
    title: 'Bài Test Hành Chính Q3/2026',
    questions: [
      {
        q: 'Văn bản hành chính cần có yếu tố bắt buộc nào?',
        opts: ['Chữ ký và con dấu hợp lệ', 'Màu sắc đẹp và bắt mắt', 'Bắt buộc dùng font Times New Roman'],
        ans: 'A',
      },
      {
        q: 'Lưu trữ hồ sơ văn phòng nên theo nguyên tắc nào?',
        opts: ['Theo màu sắc của file kẹp', 'Theo thứ tự thời gian và phân loại rõ ràng', 'Theo họ tên của nhân viên'],
        ans: 'B',
      },
      {
        q: 'Khi nhận công văn đến, việc đầu tiên cần làm là?',
        opts: ['Trả lời ngay lập tức', 'Đăng ký vào sổ theo dõi và chuyển đúng bộ phận phụ trách', 'Photo và lưu vào tủ ngay'],
        ans: 'B',
      },
      {
        q: 'Quản lý tài sản văn phòng đúng quy trình bao gồm?',
        opts: ['Mua sắm tự do khi cần', 'Kiểm kê định kỳ, bàn giao và thanh lý đúng quy trình', 'Chỉ quan tâm khi tài sản hỏng'],
        ans: 'B',
      },
      {
        q: 'Cuộc họp nội bộ hiệu quả cần đáp ứng điều gì?',
        opts: ['Càng nhiều người tham gia càng tốt', 'Có agenda rõ ràng, đúng giờ và ghi biên bản đầy đủ', 'Không cần chuẩn bị trước'],
        ans: 'B',
      },
      {
        q: 'ISO trong quản lý hành chính liên quan đến lĩnh vực nào?',
        opts: ['Phần mềm kế toán tài chính', 'Tiêu chuẩn chất lượng và quy trình quản lý', 'Thiết kế và trang trí nội thất'],
        ans: 'B',
      },
      {
        q: 'Bảo mật thông tin nội bộ cần tuân thủ nguyên tắc nào?',
        opts: ['Chia sẻ tự do với mọi người trong công ty', 'Phân quyền truy cập và ký cam kết bảo mật với nhân viên', 'Chỉ bảo mật với người ngoài công ty'],
        ans: 'B',
      },
      {
        q: 'Khi xảy ra sự cố thiết bị văn phòng, cần làm gì?',
        opts: ['Tự sửa chữa ngay lập tức', 'Báo cáo bộ phận kỹ thuật và ghi nhận sự cố vào sổ theo dõi', 'Vứt bỏ và mua thiết bị mới'],
        ans: 'B',
      },
      {
        q: 'Chi phí văn phòng phẩm được kiểm soát hiệu quả bằng cách nào?',
        opts: ['Mua bổ sung khi nào hết', 'Lập kế hoạch ngân sách và phê duyệt định mức theo tháng', 'Để nhân viên tự mua và thanh toán'],
        ans: 'B',
      },
      {
        q: 'Kỹ năng quan trọng nhất của nhân viên hành chính là?',
        opts: ['Kỹ năng thiết kế đồ hoạ', 'Tổ chức công việc, giao tiếp và quản lý thời gian hiệu quả', 'Kỹ năng lập trình phần mềm'],
        ans: 'B',
      },
    ],
  },
  {
    file: 'dao-tao.docx',
    department: 'Đào tạo',
    title: 'Bài Test Đào Tạo Q3/2026',
    questions: [
      {
        q: 'Mô hình đánh giá đào tạo Kirkpatrick gồm bao nhiêu cấp độ?',
        opts: ['3 cấp độ', '4 cấp độ', '5 cấp độ'],
        ans: 'B',
      },
      {
        q: 'OJT (On the Job Training) là hình thức đào tạo nào?',
        opts: ['Đào tạo hoàn toàn trực tuyến', 'Đào tạo trực tiếp ngay tại nơi làm việc', 'Đào tạo theo nhóm lớn'],
        ans: 'B',
      },
      {
        q: 'Mục tiêu đào tạo theo chuẩn SMART cần đảm bảo yếu tố nào?',
        opts: ['Cụ thể, đo được, khả thi, liên quan và có thời hạn', 'Đơn giản, nhanh chóng và tiết kiệm chi phí', 'Sáng tạo, thú vị và hấp dẫn học viên'],
        ans: 'A',
      },
      {
        q: 'E-learning có ưu điểm chính là gì?',
        opts: ['Tương tác trực tiếp với giảng viên cao', 'Linh hoạt về thời gian học và tiết kiệm chi phí đào tạo', 'Kiểm tra kết quả chặt chẽ hơn học offline'],
        ans: 'B',
      },
      {
        q: 'Training Needs Analysis (TNA) được dùng để làm gì?',
        opts: ['Đánh giá mức lương của nhân viên', 'Xác định khoảng cách kỹ năng và nhu cầu đào tạo thực tế', 'Lên lịch nghỉ phép cho nhân viên'],
        ans: 'B',
      },
      {
        q: 'Lý thuyết học qua trải nghiệm (Experiential Learning) do ai đề xuất?',
        opts: ['Abraham Maslow', 'David Kolb', 'Peter Drucker'],
        ans: 'B',
      },
      {
        q: 'Đánh giá sau đào tạo cần tập trung đo lường điều gì?',
        opts: ['Tổng số giờ tham gia của học viên', 'Mức độ áp dụng kiến thức vào công việc thực tế sau khoá học', 'Số lượng tài liệu được phát cho học viên'],
        ans: 'B',
      },
      {
        q: 'Buddy system trong đào tạo nhân viên mới là gì?',
        opts: ['Phương pháp học nhóm đông người', 'Nhân viên mới được hỗ trợ bởi một nhân viên có kinh nghiệm', 'Thi đua kết quả giữa các phòng ban'],
        ans: 'B',
      },
      {
        q: 'LMS (Learning Management System) là gì?',
        opts: ['Hệ thống quản lý lương và phúc lợi', 'Nền tảng quản lý và triển khai các khoá đào tạo trực tuyến', 'Phần mềm chấm công điện tử'],
        ans: 'B',
      },
      {
        q: 'Blended Learning kết hợp giữa hai hình thức nào?',
        opts: ['Lý thuyết và thực hành trong cùng một lớp học', 'Học trực tuyến (online) và học trực tiếp (offline)', 'Đào tạo cá nhân và đào tạo nhóm'],
        ans: 'B',
      },
    ],
  },
];

const buildDoc = (exam) => {
  const children = [];

  // Header info
  children.push(
    new Paragraph({
      children: [new TextRun({ text: `Phòng ban: ${exam.department}`, bold: true, size: 24 })],
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `Tên đề thi: ${exam.title}`, bold: true, size: 24 })],
      spacing: { after: 300 },
    }),
  );

  // Questions
  exam.questions.forEach((q, i) => {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `Câu ${i + 1}: ${q.q}`, bold: true, size: 22 })],
        spacing: { before: 200, after: 80 },
      }),
      new Paragraph({ children: [new TextRun({ text: `A. ${q.opts[0]}`, size: 22 })], spacing: { after: 60 } }),
      new Paragraph({ children: [new TextRun({ text: `B. ${q.opts[1]}`, size: 22 })], spacing: { after: 60 } }),
      new Paragraph({ children: [new TextRun({ text: `C. ${q.opts[2]}`, size: 22 })], spacing: { after: 60 } }),
      new Paragraph({
        children: [new TextRun({ text: `Đáp án: ${q.ans}`, bold: true, color: '16A34A', size: 22 })],
        spacing: { after: 160 },
      }),
    );
  });

  return new Document({
    sections: [{ properties: {}, children }],
  });
};

const { Packer } = require('docx');

(async () => {
  for (const exam of EXAMS) {
    const doc  = buildDoc(exam);
    const buf  = await Packer.toBuffer(doc);
    const dest = path.join(__dirname, exam.file);
    fs.writeFileSync(dest, buf);
    console.log(`✓ Created: ${dest}`);
  }
})();
