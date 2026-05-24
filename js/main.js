document.addEventListener('DOMContentLoaded', () => {
  /* ==========================================
     STICKY HEADER EFFECT
     ========================================== */
  const header = document.querySelector('header');
  const handleScroll = () => {
    if (window.scrollY > 50) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  };
  window.addEventListener('scroll', handleScroll);
  handleScroll(); // Initial check

  /* ==========================================
     MOBILE NAVIGATION TOGGLE
     ========================================== */
  const mobileToggle = document.getElementById('mobileToggle');
  const navMenu = document.getElementById('navMenu');

  if (mobileToggle && navMenu) {
    mobileToggle.addEventListener('click', () => {
      mobileToggle.classList.toggle('active');
      navMenu.classList.toggle('active');

      // Prevent scrolling when mobile menu is active
      if (navMenu.classList.contains('active')) {
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = '';
      }
    });

    // Close menu when clicking a link
    const navLinks = navMenu.querySelectorAll('a');
    navLinks.forEach(link => {
      link.addEventListener('click', () => {
        mobileToggle.classList.remove('active');
        navMenu.classList.remove('active');
        document.body.style.overflow = '';
      });
    });
  }

  /* ==========================================
     INTERACTIVE TABS (DESTINATIONS)
     ========================================== */
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetTab = button.getAttribute('data-tab');

      // Update active button
      tabButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');

      // Update active content
      tabContents.forEach(content => {
        content.classList.remove('active');
        if (content.getAttribute('id') === targetTab) {
          content.classList.add('active');
        }
      });
    });
  });

  /* ==========================================
     SCROLL REVEAL ENGINE (INTERSECTION OBSERVER)
     ========================================== */
  const revealElements = document.querySelectorAll('.reveal');

  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        // Add active class to trigger smooth animation
        entry.target.classList.add('active');
        // Unobserve element once it is shown
        observer.unobserve(entry.target);
      }
    });
  }, {
    root: null, // Viewport
    threshold: 0.15, // Trigger when 15% of the element is visible
    rootMargin: '0px 0px -50px 0px' // Slightly offset bottom threshold for better visual flow
  });

  revealElements.forEach(element => {
    revealObserver.observe(element);
  });

  /* ==========================================
     SMOOTH SCROLL NAVIGATION HIGHLIGHT
     ========================================== */
  const sections = document.querySelectorAll('section[id]');
  const menuLinks = document.querySelectorAll('nav a');

  const highlightNavigation = () => {
    const scrollPosition = window.scrollY + 120; // Offset for header height

    sections.forEach(section => {
      const sectionTop = section.offsetTop;
      const sectionHeight = section.offsetHeight;
      const sectionId = section.getAttribute('id');

      if (scrollPosition >= sectionTop && scrollPosition < sectionTop + sectionHeight) {
        menuLinks.forEach(link => {
          link.classList.remove('active');
          if (link.getAttribute('href') === `#${sectionId}`) {
            link.classList.add('active');
          }
        });
      }
    });
  };

  window.addEventListener('scroll', highlightNavigation);
  highlightNavigation(); // Initial highlight

  /* ==========================================
     FORM INTERACTIVE SUCCESS FEEDBACK
     ========================================== */
  const contactForm = document.getElementById('consultationForm');
  if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const submitBtn = contactForm.querySelector('.btn-submit');
      const originalText = submitBtn.textContent;

      submitBtn.textContent = 'ĐANG GỬI YÊU CẦU...';
      submitBtn.disabled = true;

      setTimeout(() => {
        submitBtn.textContent = 'ĐÃ GỬI THÀNH CÔNG!';
        submitBtn.style.backgroundColor = '#58A870';
        submitBtn.style.borderColor = '#58A870';

        contactForm.reset();

        setTimeout(() => {
          submitBtn.textContent = originalText;
          submitBtn.style.backgroundColor = '';
          submitBtn.style.borderColor = '';
          submitBtn.disabled = false;
        }, 3000);
      }, 1500);
    });
  }

  /* ==========================================
     STUDENT CRM SYSTEM (TỔNG QUAN)
     ========================================== */
  // Accent removal helper for emails and searching
  const removeVietnameseTones = (str) => {
    if (!str) return "";
    str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
    str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
    str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
    str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
    str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
    str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
    str = str.replace(/đ/g, "d");
    str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, "A");
    str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, "E");
    str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, "I");
    str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, "O");
    str = str.replace(/Ù|Ú|Ụ|Ủ|U|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, "U");
    str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, "Y");
    str = str.replace(/Đ/g, "D");
    // Combining marks
    str = str.replace(/\u0300|\u0301|\u0303|\u0309|\u0323/g, "");
    str = str.replace(/\u02C6|\u0306|\u031B/g, "");
    return str;
  };

  // RFC-4180 Compliant CSV parser supporting quotes, nested quotes, and line breaks
  const parseCSV = (text) => {
    // Delimiter auto-detection by evaluating the first line
    let delimiter = ',';
    const firstLine = text.split(/\r?\n/)[0] || "";
    const commaCount = (firstLine.match(/,/g) || []).length;
    const semiCount = (firstLine.match(/;/g) || []).length;
    const tabCount = (firstLine.match(/\t/g) || []).length;
    
    if (semiCount > commaCount && semiCount > tabCount) {
      delimiter = ';';
    } else if (tabCount > commaCount && tabCount > semiCount) {
      delimiter = '\t';
    }

    let lines = [];
    let row = [""];
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      let c = text[i];
      let next = text[i+1];
      if (c === '"') {
        if (inQuotes && next === '"') {
          row[row.length - 1] += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === delimiter && !inQuotes) {
        row.push("");
      } else if ((c === '\r' || c === '\n') && !inQuotes) {
        if (c === '\r' && next === '\n') { i++; }
        lines.push(row);
        row = [""];
      } else {
        row[row.length - 1] += c;
      }
    }
    if (row.length > 1 || row[0] !== "") {
      lines.push(row);
    }
    return lines;
  };

  const femaleNames = [
    "Nguyễn Thảo Chi", "Trần Thị Mai", "Lê Thu Trang", "Phạm Thùy Linh", "Hoàng Bảo Ngọc",
    "Đỗ Quỳnh Anh", "Phan Khánh Huyền", "Bùi Phương Thảo", "Võ Khánh Linh", "Nguyễn Tuyết Mai",
    "Trần Thanh Hương", "Lê Hồng Nhung", "Phạm Minh Thư", "Hoàng Yến Nhi", "Đỗ Thùy Trang",
    "Phan Thị Ngọc", "Bùi Thị Hạnh", "Nguyễn Cẩm Tú", "Trần Thu Thủy", "Lê Diệu Linh",
    "Phạm Thanh Hà", "Hoàng Thục Quyên", "Đỗ Mỹ Linh", "Phan Kiều Trang", "Bùi Trúc Quỳnh",
    "Nguyễn Kim Anh", "Trần Mai Anh", "Lê Quỳnh Chi", "Phạm Thanh Mai", "Hoàng Yến",
    "Đỗ Cát Tường", "Phan Trúc Chi", "Bùi Như Ý", "Nguyễn Hoài An", "Trần Thủy Tiên",
    "Lê Ngọc Trinh", "Phạm Huyền Trang", "Hoàng Lê Vy", "Đỗ Thùy Lâm", "Phan Hà My",
    "Bùi Bích Phương", "Nguyễn Minh Khuê", "Trần Lan Anh", "Lê Bảo Trâm", "Phạm Phương Vy",
    "Hoàng Khánh An", "Đỗ Bảo Châu", "Phan Diệp Chi", "Bùi Ngọc Ánh", "Nguyễn Phương Thảo"
  ]; // Exactly 50 female names

  const maleNames = [
    "Nguyễn Đình Châu", "Nguyễn Đức Bảo", "Trần Quốc Hưng", "Nguyễn Thành Đạt", "Võ Anh Khoa", 
    "Phan Thanh Sơn", "Đinh Tiến Dũng", "Trần Minh Quân", "Hồ Sĩ Đạt", "Lê Văn Tám", 
    "Trần Tuấn Tú", "Phạm Văn Sơn", "Hoàng Văn Tuấn", "Ngô Quốc Bảo", "Trần Văn Bình", 
    "Lê Minh Hùng", "Dương Hoài Nam", "Hoàng Minh Đức", "Phan Văn Nam", "Lê Anh Tuấn"
  ]; // Exactly 20 male names (Nguyễn Minh Đăng and Trung Văn Tuyên excluded, Phan Văn Nam and Lê Anh Tuấn added)

  // Status pool with exact required counts:
  // Đang học (28), Chờ PV (14), Trúng tuyển (17), Xuất cảnh (11)
  const statusPool = [];
  for (let i = 0; i < 28; i++) statusPool.push("Đang học");
  for (let i = 0; i < 14; i++) statusPool.push("Chờ phỏng vấn");
  for (let i = 0; i < 17; i++) statusPool.push("Đã trúng tuyển");
  for (let i = 0; i < 11; i++) statusPool.push("Đã xuất cảnh");

  // Deterministic shuffle using simple index swapping
  let tempPool = [...statusPool];
  for (let i = 0; i < tempPool.length; i++) {
    let swapIdx = (i * 37 + 13) % tempPool.length;
    let t = tempPool[i];
    tempPool[i] = tempPool[swapIdx];
    tempPool[swapIdx] = t;
  }

  const programs = [
    "Khách sạn", "Điện tử", "Chăm sóc người cao tuổi", 
    "Kỹ thuật CNC", "Nông nghiệp", "Xây dựng", 
    "Dệt may", "Cơ khí", "Hàn công nghiệp"
  ];

  const hometowns = ["Hà Nội", "Hải Phòng", "Nghệ An", "Thanh Hóa", "Quảng Ninh", "Đà Nẵng", "Thừa Thiên Huế", "Nam Định", "Hà Tĩnh", "TP. Hồ Chí Minh"];

  const schools = ["Đại học Bách Khoa", "Đại học Ngoại Thương", "Đại học Quốc Gia", "THPT Chu Văn An", "THPT Phan Đình Phùng", "THPT Kim Liên", "Đại học Công Nghiệp", "Đại học FPT"];

  let students = [];
  let fIdx = 0;
  let mIdx = 0;

  const pad = (num, size) => {
    let s = num + "";
    while (s.length < size) s = "0" + s;
    return s;
  };

  for (let i = 0; i < 70; i++) {
    // Interleaving: 20 males and 50 females
    // Every cycle of 7 has males at index 2 and 5 (10 cycles * 2 = 20 males, 10 cycles * 5 = 50 females)
    let isMale = (i % 7 === 2 || i % 7 === 5);
    let name = "";
    let gender = "";
    
    if (isMale) {
      name = maleNames[mIdx++];
      gender = "Nam";
    } else {
      name = femaleNames[fIdx++];
      gender = "Nữ";
    }
    
    let status = tempPool[i];
    
    // Japanese Level based realistically on progress status
    let japanese = "N5";
    if (status === "Đã xuất cảnh") {
      japanese = (i % 3 === 0) ? "N1" : ((i % 3 === 1) ? "N2" : "N3");
    } else if (status === "Đã trúng tuyển") {
      japanese = (i % 2 === 0) ? "N2" : "N3";
    } else if (status === "Chờ phỏng vấn") {
      japanese = (i % 2 === 0) ? "N4" : "N3";
    } else { // Đang học
      japanese = (i % 3 === 0) ? "N5" : ((i % 3 === 1) ? "N4" : "N3");
    }
    
    // Realistic parameters
    let dobDay = pad((i * 9 + 4) % 28 + 1, 2);
    let dobMonth = pad((i * 5 + 3) % 12 + 1, 2);
    let dobYear = 2002 + (i * 7) % 6;
    let dob = `${dobDay}/${dobMonth}/${dobYear}`;
    
    let phone = `0${960000000 + (i * 1478239) % 39999999}`;
    
    let nameWithoutTones = removeVietnameseTones(name).toLowerCase();
    let emailName = nameWithoutTones.split(" ").join(".");
    let email = `${emailName}@gmail.com`;
    
    let hometown = hometowns[i % hometowns.length];
    let cccd = `03830400${pad((i * 1237 + 4589) % 9000 + 1000, 4)}`;
    
    let gpa = (2.9 + (i * 0.13) % 1.05).toFixed(2);
    let education = schools[i % schools.length];
    let gradYear = 2022 + (i * 2) % 5;
    
    let program = programs[i % programs.length];
    
    let tuitionVal = 130000000 + (i % 3) * 25000000;
    let tuition = `${tuitionVal.toLocaleString('vi-VN')} VND / Năm`;
    
    let scholarship = "Không có";
    if (parseFloat(gpa) > 3.7) {
      scholarship = "50% Học phí (ThinkEdu Merit)";
    } else if (parseFloat(gpa) > 3.3) {
      scholarship = "30% Học phí (ThinkEdu Grant)";
    } else if (parseFloat(gpa) > 3.0) {
      scholarship = "10% Học phí (ThinkEdu Support)";
    }
    
    let totalCostVal = tuitionVal;
    if (scholarship.includes("50%")) {
      totalCostVal = tuitionVal * 0.5;
    } else if (scholarship.includes("30%")) {
      totalCostVal = tuitionVal * 0.7;
    } else if (scholarship.includes("10%")) {
      totalCostVal = tuitionVal * 0.9;
    }
    
    let paidVal = 0;
    if (status === "Đã xuất cảnh") {
      paidVal = totalCostVal;
    } else if (status === "Đã trúng tuyển") {
      paidVal = Math.round((totalCostVal * 0.8) / 1000000) * 1000000;
    } else if (status === "Chờ phỏng vấn") {
      paidVal = Math.round((totalCostVal * 0.4) / 1000000) * 1000000;
    } else { // Đang học
      paidVal = Math.round((totalCostVal * 0.2) / 1000000) * 1000000;
    }
    
    let remainingVal = totalCostVal - paidVal;
    let paidAmount = `${paidVal.toLocaleString('vi-VN')} VND`;
    let remainingAmount = `${remainingVal.toLocaleString('vi-VN')} VND`;
    
    let regDate = `12/${pad((i % 12) + 1, 2)}/2025`;
    let interviewDate = "Chưa có";
    let visaDate = "Chưa có";
    let flightDate = "Chưa có";
    
    if (status === "Chờ phỏng vấn" || status === "Đã trúng tuyển" || status === "Đã xuất cảnh") {
      interviewDate = `18/${pad(((i + 1) % 12) + 1, 2)}/2026`;
    }
    if (status === "Đã trúng tuyển" || status === "Đã xuất cảnh") {
      visaDate = `22/${pad(((i + 3) % 12) + 1, 2)}/2026`;
    }
    if (status === "Đã xuất cảnh") {
      flightDate = `15/${pad(((i + 4) % 12) + 1, 2)}/2026`;
    }
    
    students.push({
      id: `HV-2025-${pad(i + 1, 3)}`,
      name,
      gender,
      phone,
      program,
      status,
      japanese,
      dob,
      email,
      hometown,
      cccd,
      gpa,
      education,
      gradYear,
      tuition,
      scholarship,
      paidAmount,
      remainingAmount,
      regDate,
      interviewDate,
      visaDate,
      flightDate
    });
  }


  // Selected state and filters
  let filteredStudents = [...students];
  let filterStatus = "Tất cả";
  let searchQuery = "";
  let currentPage = 1;
  let recordsPerPage = 10;

  // Custom Table Filters
  let filterJapanese = "Tất cả";
  let filterGender = "Tất cả";
  let filterProgram = "Tất cả";

  // Elements
  const overviewDashboard = document.getElementById('overview-dashboard');
  const mainLanding = document.querySelector('main');
  const footerLanding = document.querySelector('footer');
  const btnOverview = document.getElementById('btn-overview');

  const studentTableBody = document.getElementById('studentTableBody');
  const globalSearchInput = document.getElementById('globalSearchInput');
  const tableSearchInput = document.getElementById('tableSearchInput');

  // Stats Elements
  const countAll = document.getElementById('countAll');
  const countStudying = document.getElementById('countStudying');
  const countWaitPV = document.getElementById('countWaitPV');
  const countSelected = document.getElementById('countSelected');
  const countDeparted = document.getElementById('countDeparted');

  // Pill button triggers
  const statPillBtns = document.querySelectorAll('.stat-pill-btn');

  // Pagination Elements
  const totalRecordsText = document.getElementById('totalRecordsText');
  const pageInfoText = document.getElementById('pageInfoText');
  const recordsPerPageSelect = document.getElementById('recordsPerPageSelect');
  const btnPrevPage = document.getElementById('btnPrevPage');
  const btnNextPage = document.getElementById('btnNextPage');

  // Filter Panel Elements
  const btnFilterTrigger = document.getElementById('btnFilterTrigger');
  const filterPanel = document.getElementById('filterPanel');
  const btnApplyFilters = document.getElementById('btnApplyFilters');
  const btnResetFilters = document.getElementById('btnResetFilters');
  const selectFilterJapanese = document.getElementById('filterJapanese');
  const selectFilterGender = document.getElementById('filterGender');
  const selectFilterProgram = document.getElementById('filterProgram');

  // Add Student Elements
  const btnAddStudent = document.getElementById('btnAddStudent');
  const addStudentModal = document.getElementById('addStudentModal');
  const btnCloseModal = document.getElementById('btnCloseModal');
  const btnCancelAddStudent = document.getElementById('btnCancelAddStudent');
  const addStudentForm = document.getElementById('addStudentForm');

  // Export Excel Element
  const btnExportExcel = document.getElementById('btnExportExcel');

  // Breadcrumbs Home Links
  const breadcrumbHomes = document.querySelectorAll('.breadcrumb-home-link');

  // Chat SPA Elements
  const chatDashboard = document.getElementById('chat-dashboard');
  const btnChat = document.getElementById('btn-chat');

  /* ==========================================
     SPA ROUTING & NAVIGATION CONTROLLER
     ========================================== */
  const showDashboard = () => {
    // Hide Main Landing Header
    const mainHeader = document.querySelector('header');
    if (mainHeader) mainHeader.style.display = 'none';

    // Hide Landing Page & Chat SPA
    mainLanding.style.display = 'none';
    footerLanding.style.display = 'none';
    if (chatDashboard) chatDashboard.style.display = 'none';

    // Show Dashboard
    overviewDashboard.style.display = 'block';

    // Update active state in nav
    document.querySelectorAll('nav a').forEach(link => {
      link.classList.remove('active');
    });
    if (btnOverview) btnOverview.classList.add('active');

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Initial Render
    updateDashboardStats();
    applyAllFilters();
  };

  const showLandingPage = (targetSectionId = null) => {
    // Show Main Landing Header
    const mainHeader = document.querySelector('header');
    if (mainHeader) mainHeader.style.display = '';

    // Show Landing Page
    mainLanding.style.display = 'block';
    footerLanding.style.display = 'block';

    // Hide Dashboard & Chat SPA
    overviewDashboard.style.display = 'none';
    if (chatDashboard) chatDashboard.style.display = 'none';

    // Update active nav links
    document.querySelectorAll('nav a').forEach(link => {
      link.classList.remove('active');
    });

    if (targetSectionId) {
      const targetSec = document.getElementById(targetSectionId);
      if (targetSec) {
        // Find matching nav link
        document.querySelectorAll('nav a').forEach(link => {
          if (link.getAttribute('href') === `#${targetSectionId}`) {
            link.classList.add('active');
          }
        });

        // Scroll to section
        const headerOffset = 120;
        const elementPosition = targetSec.offsetTop;
        const offsetPosition = elementPosition - headerOffset;

        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });
      }
    } else {
      // Default to Home
      const homeLink = document.querySelector('nav a[href="#hero"]');
      if (homeLink) homeLink.classList.add('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const showChat = () => {
    // Hide Main Landing Header
    const mainHeader = document.querySelector('header');
    if (mainHeader) mainHeader.style.display = 'none';

    // Hide Landing Page & CRM Dashboard
    mainLanding.style.display = 'none';
    footerLanding.style.display = 'none';
    overviewDashboard.style.display = 'none';

    // Show Chat Panel
    if (chatDashboard) chatDashboard.style.display = 'block';

    // Update active nav links
    document.querySelectorAll('nav a').forEach(link => {
      link.classList.remove('active');
    });
    if (btnChat) btnChat.classList.add('active');

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Initialize/Render Chat Content
    renderThreadList();
    renderMessages(activeThreadId);
  };

  // Nav Item click hooks
  if (btnOverview) {
    btnOverview.addEventListener('click', (e) => {
      e.preventDefault();
      showDashboard();
    });
  }

  if (btnChat) {
    btnChat.addEventListener('click', (e) => {
      e.preventDefault();
      showChat();
    });
  }

  // Connect normal landing page navigation to show landing page
  document.querySelectorAll('nav a').forEach(link => {
    if (link.id !== 'btn-overview' && link.id !== 'btn-chat') {
      link.addEventListener('click', (e) => {
        const href = link.getAttribute('href');
        if (href && href.startsWith('#')) {
          e.preventDefault();
          showLandingPage(href.substring(1));
        }
      });
    }
  });

  // Breadcrumb home action
  if (breadcrumbHomes.length > 0) {
    breadcrumbHomes.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        showLandingPage();
      });
    });
  }

  /* ==========================================
     CORE CRM DATABASE & RENDERING ENGINE
     ========================================== */
  // Avatar colors mapping helper
  const getAvatarBgColor = (name) => {
    const colors = [
      '#0B2545', // Dark Navy Blue
      '#526E8D', // Slate Blue
      '#BC9E6C', // Champagne Gold
      '#4A90E2', // Bright Blue
      '#50E3C2', // Teal
      '#F5A623', // Amber Orange
      '#D0021B', // Red
      '#9013FE', // Purple
      '#417505', // Green
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  };

  // Render stats pills
  const updateDashboardStats = () => {
    const count = (status) => students.filter(s => s.status === status).length;

    if (countAll) countAll.textContent = students.length;
    if (countStudying) countStudying.textContent = count("Đang học");
    if (countWaitPV) countWaitPV.textContent = count("Chờ phỏng vấn");
    if (countSelected) countSelected.textContent = count("Đã trúng tuyển");
    if (countDeparted) countDeparted.textContent = count("Đã xuất cảnh");
  };

  // Apply filters, search and pagination combined
  const applyAllFilters = () => {
    const filterNameInput = document.getElementById('filterName');
    const filterNameQuery = filterNameInput ? filterNameInput.value.trim() : "";

    filteredStudents = students.filter(student => {
      // 1. Pill Filter Status
      if (filterStatus !== "Tất cả" && student.status !== filterStatus) {
        return false;
      }

      // 2. Search Query (Global or Local search bar)
      const query = searchQuery.trim().toLowerCase();
      if (query) {
        const nameMatch = student.name.toLowerCase().includes(query);
        const codeMatch = student.id.toLowerCase().includes(query);
        const phoneMatch = student.phone.includes(query);
        const programMatch = student.program.toLowerCase().includes(query);
        if (!nameMatch && !codeMatch && !phoneMatch && !programMatch) {
          return false;
        }
      }

      // 3. Custom Collapsible Panel Filters
      if (filterNameQuery) {
        const studentClean = removeVietnameseTones(student.name).toLowerCase();
        const queryClean = removeVietnameseTones(filterNameQuery).toLowerCase();
        if (!studentClean.includes(queryClean)) {
          return false;
        }
      }
      if (filterJapanese !== "Tất cả" && student.japanese !== filterJapanese) {
        return false;
      }
      if (filterGender !== "Tất cả" && student.gender !== filterGender) {
        return false;
      }
      if (filterProgram !== "Tất cả" && student.program !== filterProgram) {
        return false;
      }

      return true;
    });

    currentPage = 1; // Reset to page 1 on filter
    renderTable();
  };

  // Main Render Table Body function
  const renderTable = () => {
    if (!studentTableBody) return;
    studentTableBody.innerHTML = '';

    const totalRecords = filteredStudents.length;

    // Pagination math
    const startIdx = (currentPage - 1) * recordsPerPage;
    const endIdx = Math.min(startIdx + recordsPerPage, totalRecords);

    const pageRecords = filteredStudents.slice(startIdx, endIdx);

    if (pageRecords.length === 0) {
      studentTableBody.innerHTML = `
        <tr>
          <td colspan="7" class="table-empty-row">
            <div class="empty-state-wrapper">
              <svg class="empty-icon" viewBox="0 0 24 24"><path d="M12,2A10,10 0 1,0 22,12A10,10 0 0,0 12,2M15,11H9V9H15M15,15H9V13H15"/></svg>
              <p>Không tìm thấy học viên nào phù hợp với bộ lọc.</p>
            </div>
          </td>
        </tr>
      `;

      if (totalRecordsText) totalRecordsText.textContent = `Tổng: 0 bản ghi`;
      if (pageInfoText) pageInfoText.textContent = `0-0 bản ghi`;
      if (btnPrevPage) btnPrevPage.disabled = true;
      if (btnNextPage) btnNextPage.disabled = true;
      return;
    }

    // Render records
    pageRecords.forEach(student => {
      // Get initials
      const nameParts = student.name.split(' ');
      const initials = nameParts.length > 1
        ? (nameParts[0].charAt(0) + nameParts[nameParts.length - 1].charAt(0)).toUpperCase()
        : student.name.substring(0, 2).toUpperCase();

      const avatarBg = getAvatarBgColor(student.name);

      // Status styling class mapping
      let statusClass = "badge-moidangky";
      if (student.status === "Đang học") statusClass = "badge-danghoc";
      else if (student.status === "Chờ phỏng vấn") statusClass = "badge-chopv";
      else if (student.status === "Đã trúng tuyển") statusClass = "badge-trungtuyen";
      else if (student.status === "Đã xuất cảnh") statusClass = "badge-xuatcanh";

      const tr = document.createElement('tr');
      tr.className = "student-table-row";
      tr.innerHTML = `
        <td>
          <div class="student-profile-cell">
            <div class="avatar-circle" style="background-color: ${avatarBg}">${initials}</div>
            <div class="info">
              <span class="name">${student.name}</span>
              <span class="code">${student.id}</span>
            </div>
          </div>
        </td>
        <td><span class="text-secondary">${student.gender}</span></td>
        <td><span class="text-secondary font-mono">${student.phone}</span></td>
        <td><span class="text-main-medium font-weight-500">${student.program}</span></td>
        <td><span class="crm-badge ${statusClass}">${student.status}</span></td>
        <td><span class="japanese-badge">${student.japanese}</span></td>
        <td>
          <div class="table-actions-cell">
            <button class="action-icon-btn btn-view" title="Xem hồ sơ" data-id="${student.id}">
              <svg class="action-icon" viewBox="0 0 24 24"><path d="M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,4.5C7,4.5 2.73,7.61 1,12C2.73,16.39 7,19.5 12,19.5C17,19.5 21.27,16.39 23,12C21.27,7.61 17,4.5 12,4.5M12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17Z"/></svg>
            </button>
            <button class="action-icon-btn btn-delete" title="Xóa học viên" data-id="${student.id}">
              <svg class="action-icon" viewBox="0 0 24 24"><path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/></svg>
            </button>
          </div>
        </td>
      `;

      // Action event listeners inside rows
      tr.querySelector('.btn-view').addEventListener('click', () => {
        openViewModal(student);
      });

      tr.querySelector('.btn-delete').addEventListener('click', () => {
        if (confirm(`Bạn có chắc chắn muốn xóa học viên ${student.name} (${student.id})?`)) {
          students = students.filter(s => s.id !== student.id);
          showToast(`Đã xóa học viên ${student.name} thành công!`, 'warning');
          updateDashboardStats();
          applyAllFilters();
        }
      });

      studentTableBody.appendChild(tr);
    });

    // Update pagination labels
    if (totalRecordsText) totalRecordsText.textContent = `Tổng: ${totalRecords} bản ghi`;
    if (pageInfoText) pageInfoText.textContent = `${startIdx + 1}-${endIdx} bản ghi`;

    // Disable/enable pagination buttons
    if (btnPrevPage) btnPrevPage.disabled = currentPage === 1;
    if (btnNextPage) btnNextPage.disabled = endIdx >= totalRecords;
  };

  /* ==========================================
     EVENT LISTENERS & FILTER HANDLERS
     ========================================== */

  // Stats Pills Quick Filtering
  statPillBtns.forEach(pill => {
    pill.addEventListener('click', () => {
      statPillBtns.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');

      filterStatus = pill.getAttribute('data-status');
      applyAllFilters();
    });
  });

  // Global search input
  if (globalSearchInput) {
    globalSearchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      if (tableSearchInput) tableSearchInput.value = searchQuery; // Sync local search bar
      applyAllFilters();
    });
  }

  // Local table search input
  if (tableSearchInput) {
    tableSearchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      if (globalSearchInput) globalSearchInput.value = searchQuery; // Sync global search bar
      applyAllFilters();
    });
  }

  // Toggle filter panel (Collapsible)
  if (btnFilterTrigger && filterPanel) {
    btnFilterTrigger.addEventListener('click', () => {
      const isHidden = filterPanel.style.display === 'none';
      filterPanel.style.display = isHidden ? 'block' : 'none';
      btnFilterTrigger.classList.toggle('active', isHidden);
    });
  }

  // Apply filters from panel
  if (btnApplyFilters) {
    btnApplyFilters.addEventListener('click', () => {
      filterJapanese = selectFilterJapanese.value;
      filterGender = selectFilterGender.value;
      filterProgram = selectFilterProgram.value;

      applyAllFilters();
      showToast("Đã áp dụng các bộ lọc nâng cao!", "success");
    });
  }

  // Reset filters
  if (btnResetFilters) {
    btnResetFilters.addEventListener('click', () => {
      const filterNameInput = document.getElementById('filterName');
      if (filterNameInput) filterNameInput.value = "";

      selectFilterJapanese.value = "Tất cả";
      selectFilterGender.value = "Tất cả";
      selectFilterProgram.value = "Tất cả";

      filterJapanese = "Tất cả";
      filterGender = "Tất cả";
      filterProgram = "Tất cả";

      applyAllFilters();
      showToast("Đã thiết lập lại các bộ lọc nâng cao!", "info");
    });
  }

  // Items per page selector
  if (recordsPerPageSelect) {
    recordsPerPageSelect.addEventListener('change', (e) => {
      recordsPerPage = parseInt(e.target.value);
      currentPage = 1;
      renderTable();
    });
  }

  // Pagination navigation clicks
  if (btnPrevPage) {
    btnPrevPage.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        renderTable();
      }
    });
  }

  if (btnNextPage) {
    btnNextPage.addEventListener('click', () => {
      const totalRecords = filteredStudents.length;
      if (currentPage * recordsPerPage < totalRecords) {
        currentPage++;
        renderTable();
      }
    });
  }

  /* ==========================================
     POPUP MODAL (ADD STUDENT) ENGINE
     ========================================== */
  const openModal = () => {
    if (addStudentModal) {
      addStudentModal.style.display = 'flex';
      document.body.style.overflow = 'hidden'; // Lock background scroll
    }
  };

  const closeModal = () => {
    if (addStudentModal) {
      addStudentModal.style.display = 'none';
      document.body.style.overflow = ''; // Unlock background scroll
      if (addStudentForm) addStudentForm.reset(); // Reset form fields
    }
  };

  if (btnAddStudent) btnAddStudent.addEventListener('click', openModal);
  if (btnCloseModal) btnCloseModal.addEventListener('click', closeModal);
  if (btnCancelAddStudent) btnCancelAddStudent.addEventListener('click', closeModal);

  // Overlay Click to close modal
  if (addStudentModal) {
    addStudentModal.addEventListener('click', (e) => {
      if (e.target === addStudentModal) {
        closeModal();
      }
    });
  }

  // Form Submission
  if (addStudentForm) {
    addStudentForm.addEventListener('submit', (e) => {
      e.preventDefault();

      // Grab Form fields
      const fullname = document.getElementById('newFullName').value.trim();
      const gender = document.getElementById('newGender').value;
      const phone = document.getElementById('newPhone').value.trim();
      const japanese = document.getElementById('newJapanese').value;
      const program = document.getElementById('newProgram').value;
      const status = document.getElementById('newStatus').value;

      if (!fullname || !phone) {
        showToast("Vui lòng điền đầy đủ các thông tin bắt buộc!", "error");
        return;
      }

      // Generate a nice sequential ID
      const newNum = students.length + 1;
      const newId = `HV-2025-${pad(newNum, 3)}`;

      // Generate mock details for the new student
      const dob = "20/06/2005";
      const nameWithoutTones = removeVietnameseTones(fullname).toLowerCase();
      const emailName = nameWithoutTones.split(" ").join(".");
      const email = `${emailName}@gmail.com`;
      const hometown = "Hà Nội";
      const cccd = "03830400" + Math.floor(1000 + Math.random() * 9000);
      const gpa = (3.0 + Math.random() * 0.9).toFixed(2);
      const education = "THPT Quốc Gia";
      const gradYear = 2025;
      
      const tuitionVal = 150000000;
      const tuition = "150,000,000 VND / Năm";
      const scholarship = parseFloat(gpa) > 3.5 ? "30% Học phí (ThinkEdu Grant)" : "Không có";
      
      let totalCostVal = tuitionVal;
      if (scholarship.includes("30%")) totalCostVal = tuitionVal * 0.7;
      
      let paidVal = 30000000;
      if (status === "Đã xuất cảnh") paidVal = totalCostVal;
      else if (status === "Đã trúng tuyển") paidVal = totalCostVal * 0.8;
      else if (status === "Chờ phỏng vấn") paidVal = totalCostVal * 0.4;
      
      const paidAmount = `${paidVal.toLocaleString('vi-VN')} VND`;
      const remainingAmount = `${(totalCostVal - paidVal).toLocaleString('vi-VN')} VND`;
      
      const regDate = new Date().toLocaleDateString('vi-VN');
      const interviewDate = (status === "Chờ phỏng vấn" || status === "Đã trúng tuyển" || status === "Đã xuất cảnh") ? "15/06/2026" : "Chưa có";
      const visaDate = (status === "Đã trúng tuyển" || status === "Đã xuất cảnh") ? "20/07/2026" : "Chưa có";
      const flightDate = (status === "Đã xuất cảnh") ? "15/08/2026" : "Chưa có";

      // Insert new student into array
      const newStudent = {
        id: newId,
        name: fullname,
        gender: gender,
        phone: phone,
        program: program,
        status: status,
        japanese: japanese,
        dob: dob,
        email: email,
        hometown: hometown,
        cccd: cccd,
        gpa: gpa,
        education: education,
        gradYear: gradYear,
        tuition: tuition,
        scholarship: scholarship,
        paidAmount: paidAmount,
        remainingAmount: remainingAmount,
        regDate: regDate,
        interviewDate: interviewDate,
        visaDate: visaDate,
        flightDate: flightDate
      };

      // Add to beginning of array
      students.unshift(newStudent);

      // Close Modal & toast success
      closeModal();
      showToast(`Thêm thành công học viên: ${fullname} (${newId})`, "success");

      // Refresh Data Rendering
      updateDashboardStats();
      applyAllFilters();
    });
  }

  /* ==========================================
     EXPORT EXCEL EMULATOR & TOAST NOTIFICATION
     ========================================== */

  // Export Excel action
  if (btnExportExcel) {
    btnExportExcel.addEventListener('click', () => {
      const originalText = btnExportExcel.innerHTML;
      btnExportExcel.disabled = true;
      btnExportExcel.innerHTML = `
        <svg class="btn-icon animate-spin" viewBox="0 0 24 24"><path d="M12,4V2A10,10 0 0,0 2,12H4A8,8 0 0,1 12,4Z" fill="currentColor"/></svg>
        <span>Đang xuất...</span>
      `;

      setTimeout(() => {
        try {
          // Headers for CSV
          const headers = ["Mã Học Viên", "Họ Và Tên", "Giới Tính", "Số Điện Thoại", "Đơn Hàng", "Trạng Thái", "Tiếng Nhật", "Quê Quán", "GPA", "Học Vấn", "Học Phí", "Học Bổng", "Đã Nộp", "Còn Lại"];
          let csvRows = [headers.join(",")];
          
          filteredStudents.forEach(s => {
            const row = [
              `"${s.id}"`,
              `"${s.name}"`,
              `"${s.gender}"`,
              `"${s.phone}"`,
              `"${s.program}"`,
              `"${s.status}"`,
              `"${s.japanese}"`,
              `"${s.hometown || ''}"`,
              `"${s.gpa || ''}"`,
              `"${s.education || ''}"`,
              `"${s.tuition || ''}"`,
              `"${s.scholarship || ''}"`,
              `"${s.paidAmount || ''}"`,
              `"${s.remainingAmount || ''}"`
            ];
            csvRows.push(row.join(","));
          });
          
          const csvContent = "\ufeff" + csvRows.join("\n"); // UTF-8 BOM
          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          
          const link = document.createElement("a");
          link.setAttribute("href", url);
          link.setAttribute("download", `Danh_Sach_Hoc_Vien_ThinkEdu_${new Date().toISOString().split('T')[0]}.csv`);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          
          showToast(`Đã xuất và tải xuống danh sách ${filteredStudents.length} học viên thành công!`, "success");
        } catch (error) {
          console.error(error);
          showToast("Có lỗi xảy ra khi xuất file CSV!", "error");
        } finally {
          btnExportExcel.disabled = false;
          btnExportExcel.innerHTML = originalText;
        }
      }, 1000);
    });
  }

  // Import Excel (CSV) action
  const btnImportExcel = document.getElementById('btnImportExcel');
  const importExcelInput = document.getElementById('importExcelInput');

  if (btnImportExcel && importExcelInput) {
    btnImportExcel.addEventListener('click', () => {
      importExcelInput.click();
    });

    importExcelInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function(evt) {
        try {
          const contents = evt.target.result;
          const parsedLines = parseCSV(contents);
          if (parsedLines.length < 2) {
            showToast("File spreadsheet rỗng hoặc không hợp lệ!", "error");
            return;
          }

          const csvHeaders = parsedLines[0].map(h => h.trim().toLowerCase());
          
          // Helper to clean headers for indexing
          const cleanHeader = (text) => removeVietnameseTones(text).toLowerCase().replace(/[^\w]/g, "");

          const cleanCsvHeaders = csvHeaders.map(cleanHeader);

          // Header keys to map:
          const keyMaps = {
            id: ["mahocvien", "mahv", "ma"],
            name: ["hovaten", "ten", "hoten", "tenhocvien", "hocvien"],
            gender: ["gioitinh", "phai", "sex"],
            phone: ["sodienthoai", "sdt", "phone", "dienthoai"],
            program: ["donhang", "chuongtrinh", "nganhhoc", "chuongtrinhduhoc"],
            status: ["trangthai", "tinhtrang"],
            japanese: ["tiengnhat", "trinhdotiengnhat", "trinhdo", "tiengnhatn"],
            hometown: ["quequan", "tinhthanh", "que"],
            gpa: ["gpa", "diemgpa", "diemso"],
            education: ["hocvan", "truonghoc", "truongthpt", "trinhdohocvan"],
            tuition: ["hocphi", "dongia"],
            scholarship: ["hocbong", "uudai"],
            paidAmount: ["danop", "sotiendanop", "danopluong"],
            remainingAmount: ["conlai", "soconlai"]
          };

          // Find indices
          const headerIndices = {};
          Object.keys(keyMaps).forEach(key => {
            headerIndices[key] = cleanCsvHeaders.findIndex(ch => 
              keyMaps[key].some(match => ch.includes(match))
            );
          });

          // Check if "Họ và tên" column is missing
          if (headerIndices.name === -1) {
            showToast("Spreadsheet tải lên không đúng định dạng (thiếu cột 'Họ và tên' hoặc 'Tên')!", "error");
            return;
          }

          let importCount = 0;
          let duplicateCount = 0;

          // Parse records (skipping header row)
          for (let i = 1; i < parsedLines.length; i++) {
            const row = parsedLines[i];
            // Skip empty rows
            if (row.length === 0 || (row.length === 1 && row[0] === "")) continue;

            const getValue = (key, defaultVal = "") => {
              const idx = headerIndices[key];
              if (idx === undefined || idx === -1 || row[idx] === undefined) return defaultVal;
              let val = row[idx].trim();
              // Manually strip enclosing double quotes if any left
              if (val.startsWith('"') && val.endsWith('"')) {
                val = val.substring(1, val.length - 1).trim();
              }
              return val || defaultVal;
            };

            const rawName = getValue("name");
            // Skip headers replica or blank names to avoid breaking the renderers
            if (!rawName || rawName.toLowerCase() === "hovaten" || rawName.toLowerCase() === "ho va ten" || rawName.toLowerCase() === "họ và tên") continue;

            let rawId = getValue("id");
            // If duplicate or empty, generate sequential ID
            if (!rawId || students.some(s => s.id === rawId)) {
              if (rawId) duplicateCount++;
              const nextNum = students.length + 1;
              rawId = `HV-2025-${pad(nextNum, 3)}`;
            }

            const rawGender = getValue("gender", "Nữ");
            const rawPhone = getValue("phone", "Chưa cập nhật");
            const rawProgram = getValue("program", "Khách sạn");
            const rawStatus = getValue("status", "Đang học");
            const rawJapanese = getValue("japanese", "N5");
            const rawHometown = getValue("hometown", "Hà Nội");
            const rawGpa = getValue("gpa", "3.00");
            const rawEducation = getValue("education", "THPT Quốc Gia");
            const rawTuition = getValue("tuition", "150,000,000 VND / Năm");
            const rawScholarship = getValue("scholarship", "Không có");
            const rawPaid = getValue("paidAmount", "0 VND");
            const rawRemaining = getValue("remainingAmount", "150,000,000 VND");

            // Extra details fallbacks
            const nameWithoutTones = removeVietnameseTones(rawName).toLowerCase();
            const emailName = nameWithoutTones.split(" ").join(".");
            const rawEmail = `${emailName}@gmail.com`;
            const rawCccd = "03830400" + Math.floor(1000 + Math.random() * 9000);

            const newStudent = {
              id: rawId,
              name: rawName,
              gender: rawGender,
              phone: rawPhone,
              program: rawProgram,
              status: rawStatus,
              japanese: rawJapanese,
              dob: "20/06/2005",
              email: rawEmail,
              hometown: rawHometown,
              cccd: rawCccd,
              gpa: rawGpa,
              education: rawEducation,
              gradYear: 2025,
              tuition: rawTuition,
              scholarship: rawScholarship,
              paidAmount: rawPaid,
              remainingAmount: rawRemaining,
              regDate: new Date().toLocaleDateString('vi-VN'),
              interviewDate: (rawStatus.includes("phỏng vấn") || rawStatus.includes("trúng tuyển") || rawStatus.includes("xuất cảnh")) ? "15/06/2026" : "Chưa có",
              visaDate: (rawStatus.includes("trúng tuyển") || rawStatus.includes("xuất cảnh")) ? "20/07/2026" : "Chưa có",
              flightDate: rawStatus.includes("xuất cảnh") ? "15/08/2026" : "Chưa có"
            };

            students.unshift(newStudent);
            importCount++;
          }

          if (importCount > 0) {
            updateDashboardStats();
            applyAllFilters();
            let msg = `Nhập thành công ${importCount} học viên từ file Excel!`;
            if (duplicateCount > 0) msg += ` (Đã cấp mã mới cho ${duplicateCount} học viên trùng mã)`;
            showToast(msg, "success");
          } else {
            showToast("Không tìm thấy học viên hợp lệ nào trong file!", "warning");
          }

        } catch (err) {
          console.error(err);
          showToast("Đọc file spreadsheet thất bại! Kiểm tra cấu trúc CSV.", "error");
        } finally {
          importExcelInput.value = ""; // clear selector
        }
      };

      reader.readAsText(file, "UTF-8");
    });
  }

  /* ==========================================
     VIEW STUDENT DETAILS MODAL POPULATOR
     ========================================== */
  const viewStudentModal = document.getElementById('viewStudentModal');
  const btnCloseViewModal = document.getElementById('btnCloseViewModal');
  const btnCloseViewModalBottom = document.getElementById('btnCloseViewModalBottom');

  const openViewModal = (student) => {
    if (!viewStudentModal) return;

    // Build Initials
    const nameParts = student.name.split(' ');
    const initials = nameParts.length > 1
      ? (nameParts[0].charAt(0) + nameParts[nameParts.length - 1].charAt(0)).toUpperCase()
      : student.name.substring(0, 2).toUpperCase();

    const avatarBg = getAvatarBgColor(student.name);

    // Header values
    const detailAvatar = document.getElementById('detailAvatar');
    if (detailAvatar) {
      detailAvatar.textContent = initials;
      detailAvatar.style.backgroundColor = avatarBg;
    }

    const detailFullName = document.getElementById('detailFullName');
    if (detailFullName) detailFullName.textContent = student.name;

    const detailStudentId = document.getElementById('detailStudentId');
    if (detailStudentId) detailStudentId.textContent = student.id;

    const detailStatusBadge = document.getElementById('detailStatusBadge');
    if (detailStatusBadge) {
      detailStatusBadge.textContent = student.status;
      detailStatusBadge.className = 'crm-badge';
      
      let statusClass = "badge-moidangky";
      if (student.status === "Đang học") statusClass = "badge-danghoc";
      else if (student.status === "Chờ phỏng vấn") statusClass = "badge-chopv";
      else if (student.status === "Đã trúng tuyển") statusClass = "badge-trungtuyen";
      else if (student.status === "Đã xuất cảnh") statusClass = "badge-xuatcanh";
      
      detailStatusBadge.classList.add(statusClass);
    }

    // Personal details
    document.getElementById('detailGender').textContent = student.gender;
    document.getElementById('detailDob').textContent = student.dob || "15/08/2004";
    document.getElementById('detailPhone').textContent = student.phone;
    document.getElementById('detailEmail').textContent = student.email || `${student.id.toLowerCase()}@gmail.com`;
    document.getElementById('detailHometown').textContent = student.hometown || "Hà Nội";
    document.getElementById('detailCccd').textContent = student.cccd || "038304001234";

    // Academic details
    document.getElementById('detailJapanese').textContent = student.japanese;
    document.getElementById('detailGpa').textContent = student.gpa ? `${student.gpa} / 4.0` : "3.15 / 4.0";
    document.getElementById('detailEducation').textContent = student.education || "THPT Quốc Gia";
    document.getElementById('detailGradYear').textContent = student.gradYear || "2024";

    // Program & finances
    document.getElementById('detailProgram').textContent = student.program;
    document.getElementById('detailTuition').textContent = student.tuition || "150,000,000 VND / Năm";
    document.getElementById('detailScholarship').textContent = student.scholarship || "Không có";
    document.getElementById('detailPaidAmount').textContent = student.paidAmount || "30,000,000 VND";
    document.getElementById('detailRemainingAmount').textContent = student.remainingAmount || "120,000,000 VND";

    // Milestones
    document.getElementById('detailRegDate').textContent = student.regDate || "10/01/2026";
    document.getElementById('detailInterviewDate').textContent = student.interviewDate || "Chưa có";
    document.getElementById('detailVisaDate').textContent = student.visaDate || "Chưa có";
    document.getElementById('detailFlightDate').textContent = student.flightDate || "Chưa có";

    // Display modal
    viewStudentModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  };

  const closeViewModal = () => {
    if (viewStudentModal) {
      viewStudentModal.style.display = 'none';
      document.body.style.overflow = '';
    }
  };

  if (btnCloseViewModal) btnCloseViewModal.addEventListener('click', closeViewModal);
  if (btnCloseViewModalBottom) btnCloseViewModalBottom.addEventListener('click', closeViewModal);

  if (viewStudentModal) {
    viewStudentModal.addEventListener('click', (e) => {
      if (e.target === viewStudentModal) {
        closeViewModal();
      }
    });
  }

  // Toggle Dark Mode
  const darkModeToggle = document.getElementById('darkModeToggle');
  if (darkModeToggle) {
    darkModeToggle.addEventListener('click', () => {
      document.body.classList.toggle('dark-theme-crm');
      const isDark = document.body.classList.contains('dark-theme-crm');
      showToast(isDark ? "Đã chuyển sang giao diện tối!" : "Đã chuyển sang giao diện sáng!", "info");
    });
  }

  // Toast Generator
  const showToast = (message, type = 'info') => {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = '<svg viewBox="0 0 24 24"><path d="M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z"/></svg>';
    } else if (type === 'error') {
      iconSvg = '<svg viewBox="0 0 24 24"><path d="M12,2C5.9,2 1,6.9 1,13C1,19.1 5.9,24 12,24C18.1,24 23,19.1 23,13C23,6.9 18.1,2 12,2M13,18H11V16H13V18M13,14H11V8H13V14Z"/></svg>';
    } else if (type === 'warning') {
      iconSvg = '<svg viewBox="0 0 24 24"><path d="M12,2L1,21H23L12,2M12,6L19.53,19H4.47L12,6M11,10V14H13V10H11M11,16V18H13V16H11Z"/></svg>';
    } else {
      // Info icon
      iconSvg = '<svg viewBox="0 0 24 24"><path d="M11,9H13V7H11V9M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M11,17H13V11H11V17Z"/></svg>';
    }

    toast.innerHTML = `
      <div class="toast-icon">${iconSvg}</div>
      <div class="toast-message">${message}</div>
      <button class="toast-close">&times;</button>
    `;

    toast.querySelector('.toast-close').addEventListener('click', () => {
      toast.classList.add('toast-fade-out');
      setTimeout(() => toast.remove(), 400);
    });

    container.appendChild(toast);

    // Auto remove after 4 seconds
    setTimeout(() => {
      if (toast.parentElement) {
        toast.classList.add('toast-fade-out');
        setTimeout(() => toast.remove(), 400);
      }
    }, 4000);
  };

  /* ==========================================================================
     TELEGRAM-STYLE CHAT SYSTEM LOGIC & DATA
     ========================================================================== */
  let chatThreads = [
    {
      id: "group-1",
      name: "Ban Điều Hành ThinkEdu",
      type: "group",
      avatarInitials: "BĐ",
      avatarBg: "#0B2545",
      membersCount: 3,
      messages: [
        { sender: "Nguyễn Thảo Chi", content: "Dạ em chào anh Mạnh và anh Quân. Danh sách 20 học viên nam đan xen đã sẵn sàng rồi ạ.", time: "16:20" },
        { sender: "Trần Minh Quân", content: "Tuyệt vời Thảo Chi. Tiến độ phỏng vấn các bạn chờ PV thế nào rồi em?", time: "16:22" },
        { sender: "Nguyễn Thảo Chi", content: "Các hồ sơ phỏng vấn đợt này đã chuẩn bị dịch thuật công chứng xong xuôi. Chiều nay em gửi đối tác Nhật duyệt ạ.", time: "16:25" }
      ]
    },
    {
      id: "group-2",
      name: "Tư Vấn & Xử Lý Hồ Sơ",
      type: "group",
      avatarInitials: "HS",
      avatarBg: "#BC9E6C",
      membersCount: 4,
      messages: [
        { sender: "Lê Thu Trang", content: "Học viên mới HV-2025-071 vừa nộp hồ sơ Đại học Ngoại Thương, GPA 3.65 ạ.", time: "15:10" },
        { sender: "Nguyễn Thảo Chi", content: "Hồ sơ GPA tốt quá, để em liên hệ tư vấn học bổng ThinkEdu Merit 50%.", time: "15:15" }
      ]
    },
    {
      id: "dm-1",
      name: "Nguyễn Thảo Chi",
      type: "dm",
      avatarInitials: "TC",
      avatarBg: "#4A90E2",
      status: "online",
      messages: [
        { sender: "Nguyễn Thảo Chi", content: "Chào anh Mạnh, anh duyệt hộ em trường hợp học viên Lý Bảo Ngọc xin nộp muộn học phí đợt 2 với ạ.", time: "10:30" },
        { sender: "Dương Đức Mạnh", content: "Chào Chi, Ngọc xin gia hạn đến bao giờ em?", time: "10:35" },
        { sender: "Nguyễn Thảo Chi", content: "Dạ bạn ấy xin gia hạn đến ngày 10/06 vì gia đình đang chờ rút sổ tiết kiệm ạ.", time: "10:36" },
        { sender: "Dương Đức Mạnh", content: "Đồng ý nhé em, note lại vào cột tiến trình hồ sơ của Ngọc giúp anh.", time: "10:40" },
        { sender: "Nguyễn Thảo Chi", content: "Dạ vâng em cảm ơn anh Mạnh nhiều ạ!", time: "10:42" }
      ]
    },
    {
      id: "dm-2",
      name: "Trần Minh Quân",
      type: "dm",
      avatarInitials: "MQ",
      avatarBg: "#50E3C2",
      status: "offline",
      messages: [
        { sender: "Trần Minh Quân", content: "Anh Mạnh ơi, lịch khai giảng lớp Tiếng Nhật N4 ca tối khóa mới chốt ngày 01/06 đúng không anh?", time: "Hôm qua" },
        { sender: "Dương Đức Mạnh", content: "Đúng rồi Quân, chốt lịch đó để chuẩn bị tài liệu nhé.", time: "Hôm qua" }
      ]
    }
  ];

  let activeThreadId = "group-1";
  let chatSearchQuery = "";
  let activeChatSearchQuery = ""; // Query for highlighting inside the conversation

  // Render Dynamic Actions Dropdown Menu next to 3-dots
  const renderChatHeaderDropdown = (thread) => {
    const dropdown = document.getElementById('chatHeaderDropdown');
    if (!dropdown) return;
    dropdown.innerHTML = '';

    const isDM = thread.type === "dm";
    
    if (isDM) {
      // 1. Mute/Unmute option
      const muteBtn = document.createElement('div');
      muteBtn.className = 'chat-dropdown-item';
      const muteIcon = thread.isMuted 
        ? `<svg viewBox="0 0 24 24"><path d="M12,2A3,3 0 0,0 9,5A3,3 0 0,0 9,5.22C6.18,6.23 4,9 4,12V17L2,19V20H22V19L20,17V12C20,9 17.82,6.23 15,5.22A3,3 0 0,0 15,5A3,3 0 0,0 12,2M12,22A2,2 0 0,0 14,20H10A2,2 0 0,0 12,22Z"/></svg>`
        : `<svg viewBox="0 0 24 24"><path d="M20,18.66L18.89,17.55C19.58,16.03 20,14.07 20,12V11C20,9.54 19.34,8.19 18.23,7.21C18.6,5.92 18.23,4.5 17.26,3.5C16.27,2.54 14.86,2.17 13.57,2.53C12.59,1.43 11.23,0.77 9.77,0.77C9.3,0.77 8.84,0.85 8.42,1L4.85,1C4.41,1 4,1.41 4,1.85V3.12L2,1.12L0.73,2.39L20,21.66L21.27,20.39L20,19.12M12,22A2,2 0 0,0 14,20H10A2,2 0 0,0 12,22Z"/></svg>`;
      muteBtn.innerHTML = `
        ${muteIcon}
        <span>${thread.isMuted ? 'Bật thông báo' : 'Tắt thông báo'}</span>
      `;
      muteBtn.addEventListener('click', () => {
        thread.isMuted = !thread.isMuted;
        showToast(thread.isMuted ? "Đã tắt thông báo cuộc trò chuyện này!" : "Đã bật thông báo cuộc trò chuyện này!", thread.isMuted ? "warning" : "success");
        dropdown.style.display = 'none';
        renderThreadList();
        renderMessages(activeThreadId);
      });
      dropdown.appendChild(muteBtn);

      // 2. Block/Unblock option
      const blockBtn = document.createElement('div');
      blockBtn.className = 'chat-dropdown-item danger-item';
      const blockIcon = thread.isBlocked
        ? `<svg viewBox="0 0 24 24"><path d="M12,2A10,10 0 1,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12,6A6,6 0 0,0 6,12A6,6 0 0,0 12,18A6,6 0 0,0 18,12A6,6 0 0,0 12,6Z"/></svg>`
        : `<svg viewBox="0 0 24 24"><path d="M12,2A10,10 0 1,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 17.66,16.24L6.38,4.96A7.94,7.94 0 0,1 12,4M12,20A8,8 0 0,1 6.34,7.76L17.62,19.04A7.94,7.94 0 0,1 12,20Z"/></svg>`;
      blockBtn.innerHTML = `
        ${blockIcon}
        <span>${thread.isBlocked ? 'Bỏ chặn' : 'Chặn liên hệ'}</span>
      `;
      blockBtn.addEventListener('click', () => {
        thread.isBlocked = !thread.isBlocked;
        showToast(thread.isBlocked ? `Đã chặn liên hệ ${thread.name}!` : `Đã bỏ chặn liên hệ ${thread.name}!`, thread.isBlocked ? "error" : "success");
        dropdown.style.display = 'none';
        renderThreadList();
        renderMessages(activeThreadId);
      });
      dropdown.appendChild(blockBtn);

      // 3. Delete option
      const deleteBtn = document.createElement('div');
      deleteBtn.className = 'chat-dropdown-item danger-item';
      deleteBtn.innerHTML = `
        <svg viewBox="0 0 24 24"><path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/></svg>
        <span>Xóa liên hệ</span>
      `;
      deleteBtn.addEventListener('click', () => {
        if (confirm(`Bạn có chắc chắn muốn xóa cuộc trò chuyện với ${thread.name}?`)) {
          chatThreads = chatThreads.filter(t => t.id !== thread.id);
          showToast(`Đã xóa liên hệ ${thread.name} khỏi danh sách chat.`, "warning");
          dropdown.style.display = 'none';
          
          // Switch to first visible thread
          const nextThread = chatThreads.find(t => !t.isHidden);
          activeThreadId = nextThread ? nextThread.id : null;
          
          renderThreadList();
          if (activeThreadId) {
            renderMessages(activeThreadId);
          } else {
            const container = document.getElementById('chatMessagesContainer');
            if (container) container.innerHTML = '<div style="padding:4rem; text-align:center; color:var(--text-muted); font-size:0.9rem;">Hãy chọn một cuộc trò chuyện để bắt đầu.</div>';
            const activeTitle = document.getElementById('activeChatTitle');
            if (activeTitle) activeTitle.textContent = "Chưa chọn hội thoại";
          }
        }
      });
      dropdown.appendChild(deleteBtn);
      
    } else {
      // Group Actions: Mute, Hide, Leave
      // 1. Mute/Unmute option
      const muteBtn = document.createElement('div');
      muteBtn.className = 'chat-dropdown-item';
      const muteIcon = thread.isMuted 
        ? `<svg viewBox="0 0 24 24"><path d="M12,2A3,3 0 0,0 9,5A3,3 0 0,0 9,5.22C6.18,6.23 4,9 4,12V17L2,19V20H22V19L20,17V12C20,9 17.82,6.23 15,5.22A3,3 0 0,0 15,5A3,3 0 0,0 12,2M12,22A2,2 0 0,0 14,20H10A2,2 0 0,0 12,22Z"/></svg>`
        : `<svg viewBox="0 0 24 24"><path d="M20,18.66L18.89,17.55C19.58,16.03 20,14.07 20,12V11C20,9.54 19.34,8.19 18.23,7.21C18.6,5.92 18.23,4.5 17.26,3.5C16.27,2.54 14.86,2.17 13.57,2.53C12.59,1.43 11.23,0.77 9.77,0.77C9.3,0.77 8.84,0.85 8.42,1L4.85,1C4.41,1 4,1.41 4,1.85V3.12L2,1.12L0.73,2.39L20,21.66L21.27,20.39L20,19.12M12,22A2,2 0 0,0 14,20H10A2,2 0 0,0 12,22Z"/></svg>`;
      muteBtn.innerHTML = `
        ${muteIcon}
        <span>${thread.isMuted ? 'Bật thông báo' : 'Tắt thông báo'}</span>
      `;
      muteBtn.addEventListener('click', () => {
        thread.isMuted = !thread.isMuted;
        showToast(thread.isMuted ? "Đã tắt thông báo nhóm trò chuyện này!" : "Đã bật thông báo nhóm trò chuyện này!", thread.isMuted ? "warning" : "success");
        dropdown.style.display = 'none';
        renderThreadList();
        renderMessages(activeThreadId);
      });
      dropdown.appendChild(muteBtn);

      // 2. Hide option
      const hideBtn = document.createElement('div');
      hideBtn.className = 'chat-dropdown-item';
      hideBtn.innerHTML = `
        <svg viewBox="0 0 24 24"><path d="M11.83,9L15,12.17C14.82,12.62 14.44,13 14,13.18L11.83,9M9,9.17L10.83,11C10.82,11.34 11,11.66 11.17,11.83L9,9.17M12,4.5C17,4.5 21.27,7.61 23,12C21.87,14.43 20.11,16.44 17.87,17.65L16.37,16.15C18.11,15.15 19.53,13.72 20.5,12C18.94,9.27 15.68,7.5 12,7.5C11.31,7.5 10.63,7.59 10,7.77L8.5,6.27C9.6,5.17 10.77,4.5 12,4.5M2,4.27L4.28,2L22.28,20L20,22.27L18.27,20.54C16.5,21.5 14.3,22 12,22C7,22 2.73,18.89 1,14.5C2,12.07 3.5,10.06 5.5,8.8L2,5.27M7,10.28L8.73,12C8.73,13.8 10.2,15.27 12,15.27L13.73,17C13.2,17.2 12.6,17.3 12,17.3C9.07,17.3 6.7,14.93 6.7,12C6.7,11.4 6.8,10.8 7,10.28Z"/></svg>
        <span>Ẩn trò chuyện</span>
      `;
      hideBtn.addEventListener('click', () => {
        thread.isHidden = true;
        showToast(`Đã ẩn nhóm "${thread.name}". Bạn vẫn có thể tìm thấy nhóm khi tìm kiếm.`, "info");
        dropdown.style.display = 'none';

        // Select next visible thread
        const nextThread = chatThreads.find(t => !t.isHidden);
        activeThreadId = nextThread ? nextThread.id : null;
        
        renderThreadList();
        if (activeThreadId) {
          renderMessages(activeThreadId);
        } else {
          const container = document.getElementById('chatMessagesContainer');
          if (container) container.innerHTML = '<div style="padding:4rem; text-align:center; color:var(--text-muted); font-size:0.9rem;">Hãy chọn một cuộc trò chuyện để bắt đầu.</div>';
          const activeTitle = document.getElementById('activeChatTitle');
          if (activeTitle) activeTitle.textContent = "Chưa chọn hội thoại";
        }
      });
      dropdown.appendChild(hideBtn);

      // 3. Leave Group option
      const leaveBtn = document.createElement('div');
      leaveBtn.className = 'chat-dropdown-item danger-item';
      leaveBtn.innerHTML = `
        <svg viewBox="0 0 24 24"><path d="M14.08,15.59L16.67,13H7V11H16.67L14.08,8.41L15.5,7L20.5,12L15.5,17L14.08,15.59M19,3A2,2 0 0,1 21,5V9.67L19,7.67V5H5V19H19V16.33L21,14.33V19A2,2 0 0,1 19,21H5C3.89,21 3,20.1 3,19V5C3,3.89 3.89,3 5,3H19Z"/></svg>
        <span>Rời nhóm</span>
      `;
      leaveBtn.addEventListener('click', () => {
        if (confirm(`Bạn có chắc chắn muốn rời nhóm "${thread.name}"?`)) {
          chatThreads = chatThreads.filter(t => t.id !== thread.id);
          showToast(`Bạn đã rời nhóm "${thread.name}" thành công!`, "warning");
          dropdown.style.display = 'none';

          // Select next visible thread
          const nextThread = chatThreads.find(t => !t.isHidden);
          activeThreadId = nextThread ? nextThread.id : null;

          renderThreadList();
          if (activeThreadId) {
            renderMessages(activeThreadId);
          } else {
            const container = document.getElementById('chatMessagesContainer');
            if (container) container.innerHTML = '<div style="padding:4rem; text-align:center; color:var(--text-muted); font-size:0.9rem;">Hãy chọn một cuộc trò chuyện để bắt đầu.</div>';
            const activeTitle = document.getElementById('activeChatTitle');
            if (activeTitle) activeTitle.textContent = "Chưa chọn hội thoại";
          }
        }
      });
      dropdown.appendChild(leaveBtn);
    }
  };

  // Render Emojis Board Grid
  const renderEmojiPicker = () => {
    const picker = document.getElementById('chatEmojiPicker');
    if (!picker) return;
    picker.innerHTML = '';

    const emojis = ["😊", "😂", "🤣", "❤️", "👍", "🔥", "🎉", "😍", "😘", "🥺", "😭", "😮", "😡", "🙏", "👏", "🙌", "✨", "🌟", "🚀", "💡", "💯"];
    
    const grid = document.createElement('div');
    grid.className = 'emoji-picker-grid';

    emojis.forEach(emoji => {
      const btn = document.createElement('button');
      btn.className = 'emoji-btn';
      btn.textContent = emoji;
      btn.type = 'button';
      btn.addEventListener('click', () => {
        const input = document.getElementById('chatMessageInput');
        if (input && !input.disabled) {
          input.value += emoji;
          input.focus();
        }
        picker.style.display = 'none';
      });
      grid.appendChild(btn);
    });

    picker.appendChild(grid);
  };

  // Render Thread List Sidebar
  const renderThreadList = () => {
    const listContainer = document.getElementById('chatThreadsList');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    const query = chatSearchQuery.trim().toLowerCase();
    
    // Filter out hidden threads and match search terms
    const filteredThreads = chatThreads.filter(t => {
      if (t.isHidden) return false;
      if (!query) return true;
      return t.name.toLowerCase().includes(query) || 
             t.messages.some(m => m.content.toLowerCase().includes(query));
    });

    if (filteredThreads.length === 0) {
      listContainer.innerHTML = `
        <div style="padding: 2rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
          Không tìm thấy hội thoại nào phù hợp.
        </div>
      `;
      return;
    }

    filteredThreads.forEach(thread => {
      const activeClass = (thread.id === activeThreadId) ? 'active' : '';
      const lastMsg = thread.messages.length > 0 ? thread.messages[thread.messages.length - 1] : { content: "Chưa có tin nhắn", time: "" };
      
      const isDM = thread.type === "dm";
      
      // Muted status styling
      const mutedIndicator = thread.isMuted ? ' <span style="font-size:0.75rem;opacity:0.6;">🔇</span>' : '';

      const div = document.createElement('div');
      div.className = `chat-thread-item ${activeClass}`;
      div.innerHTML = `
        <div class="avatar-circle" style="background-color: ${thread.avatarBg};">${thread.avatarInitials}</div>
        <div class="chat-thread-details">
          <div class="chat-thread-header">
            <span class="title">${thread.name}${mutedIndicator}</span>
            <span class="time">${lastMsg.time}</span>
          </div>
          <div class="chat-thread-preview">
            <span class="message">${lastMsg.sender ? lastMsg.sender + ': ' : ''}${lastMsg.content}</span>
            ${thread.unread ? `<span class="unread-badge">${thread.unread}</span>` : ''}
          </div>
        </div>
      `;

      div.addEventListener('click', () => {
        activeThreadId = thread.id;
        thread.unread = 0; // Clear unread on click
        // Clear active conversation search when switching chats
        activeChatSearchQuery = "";
        const inlineSearch = document.getElementById('chatSearchInline');
        const inlineSearchInput = document.getElementById('chatMessageSearchInput');
        if (inlineSearch) inlineSearch.style.display = 'none';
        if (inlineSearchInput) inlineSearchInput.value = '';
        
        // Add show-conversation class to chat body on mobile to activate full conversation view
        const chatCanvas = document.querySelector('.chat-canvas-body');
        if (chatCanvas) chatCanvas.classList.add('show-conversation');
        
        renderThreadList();
        renderMessages(activeThreadId);
      });

      listContainer.appendChild(div);
    });
  };

  // Render Messages in active thread
  const renderMessages = (threadId) => {
    const thread = chatThreads.find(t => t.id === threadId);
    const container = document.getElementById('chatMessagesContainer');
    if (!thread || !container) return;

    // 1. Update Header Info dynamically
    const header = document.getElementById('chatWindowHeader');
    if (header) {
      const avatarCircle = header.querySelector('#activeChatAvatar');
      const titleText = header.querySelector('#activeChatTitle');
      const statusSpan = header.querySelector('#activeChatMembersCount');

      if (avatarCircle) {
        avatarCircle.textContent = thread.avatarInitials;
        avatarCircle.style.backgroundColor = thread.avatarBg;
      }
      
      // Display name and muted indicator in header
      const mutedHeaderIndicator = thread.isMuted ? ' 🔇' : '';
      if (titleText) titleText.textContent = thread.name + mutedHeaderIndicator;
      
      if (statusSpan) {
        let statusLabel = "";
        if (thread.isBlocked) {
          statusLabel = "Đã chặn";
        } else {
          const isDM = thread.type === "dm";
          statusLabel = isDM ? (thread.status === "online" ? "Đang hoạt động" : "Ngoại tuyến") : `${thread.membersCount} thành viên`;
        }
        statusSpan.textContent = statusLabel;
        statusSpan.className = (thread.type === "dm" && thread.status === "online" && !thread.isBlocked) ? "status-online" : "";
      }
    }

    // 2. Lock input bar if contact is blocked
    const inputField = document.getElementById('chatMessageInput');
    const sendBtn = document.getElementById('btnSendChatMessage');
    if (thread.isBlocked) {
      if (inputField) {
        inputField.disabled = true;
        inputField.placeholder = "Bạn đã chặn người dùng này. Bỏ chặn để gửi tin nhắn.";
        inputField.value = "";
      }
      if (sendBtn) sendBtn.disabled = true;
    } else {
      if (inputField) {
        inputField.disabled = false;
        inputField.placeholder = "Nhập tin nhắn trò chuyện...";
      }
      if (sendBtn) sendBtn.disabled = false;
    }

    // 3. Render floating options dropdown next to 3-dots
    renderChatHeaderDropdown(thread);

    // 4. Render bubbles
    container.innerHTML = '';
    
    thread.messages.forEach(msg => {
      const isSentByMe = (msg.sender === "Dương Đức Mạnh");
      const bubbleRow = document.createElement('div');
      bubbleRow.className = `chat-bubble-row ${isSentByMe ? 'sent' : 'received'}`;
      
      let receivedAvatar = '';
      let senderLabel = '';
      
      if (!isSentByMe) {
        const initials = msg.sender.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        const avatarBg = getAvatarBgColor(msg.sender);
        receivedAvatar = `<div class="avatar-circle" style="background-color: ${avatarBg}; font-size: 0.7rem;">${initials}</div>`;
        
        // In group chats, display sender name
        if (thread.type === "group") {
          senderLabel = `<span class="sender-name">${msg.sender}</span>`;
        }
      }

      // 5. Highlight text matches if conversation search query exists
      let displayContent = msg.content;
      if (activeChatSearchQuery) {
        const escapedQuery = activeChatSearchQuery.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`(${escapedQuery})`, 'gi');
        displayContent = msg.content.replace(regex, '<span class="highlight-match">$1</span>');
      }

      bubbleRow.innerHTML = `
        ${receivedAvatar}
        <div class="chat-bubble">
          ${senderLabel}
          <div class="content">${displayContent}</div>
          <span class="time-stamp">${msg.time}</span>
        </div>
      `;
      
      container.appendChild(bubbleRow);
    });

    // Auto scroll to bottom
    container.scrollTop = container.scrollHeight;
  };

  // Send Message Logic
  const handleSendMessage = () => {
    const input = document.getElementById('chatMessageInput');
    if (!input) return;
    const content = input.value.trim();
    if (!content) return;

    const thread = chatThreads.find(t => t.id === activeThreadId);
    if (!thread) return;

    const now = new Date();
    const timeStr = `${pad(now.getHours(), 2)}:${pad(now.getMinutes(), 2)}`;

    // Push new message
    thread.messages.push({
      sender: "Dương Đức Mạnh",
      content: content,
      time: timeStr
    });

    input.value = ''; // clear input
    renderThreadList();
    renderMessages(activeThreadId);

    // Dynamic Automated Mock Response after 1.5s
    setTimeout(() => {
      triggerMockResponse(thread);
    }, 1500);
  };

  // Trigger realistic mock automated auto-reply responses based on channel context
  const triggerMockResponse = (thread) => {
    const now = new Date();
    const timeStr = `${pad(now.getHours(), 2)}:${pad(now.getMinutes(), 2)}`;
    
    let responder = "";
    let replyContent = "";

    // Pick responder based on channel
    if (thread.id === "group-1") {
      responder = Math.random() > 0.5 ? "Nguyễn Thảo Chi" : "Trần Minh Quân";
      const replies = [
        "Dạ vâng anh Mạnh, em nhận được thông tin chỉ đạo rồi ạ.",
        "Em đang triển khai ngay đây anh ơi.",
        "Ok anh Mạnh, để em tạo cuộc họp trao đổi thêm về lịch visa.",
        "Để em chốt danh sách học viên nam gửi anh duyệt sớm."
      ];
      replyContent = replies[Math.floor(Math.random() * replies.length)];
    } else if (thread.id === "group-2") {
      responder = "Lê Thu Trang";
      const replies = [
        "Hồ sơ dịch thuật của các bạn nam bay đợt này đã hoàn thành công chứng rồi ạ.",
        "Để em kiểm tra lại chứng từ học phí của Lý Bảo Ngọc.",
        "Dạ, hồ sơ bên đối tác Nhật vừa duyệt qua hệ thống ạ."
      ];
      replyContent = replies[Math.floor(Math.random() * replies.length)];
    } else if (thread.type === "dm") {
      responder = thread.name;
      // Change status to online to make it realistic
      thread.status = "online";
      
      const replies = [
        "Vâng anh Mạnh, em đang làm việc trực tiếp với phụ huynh học sinh đây ạ.",
        "Em gửi báo cáo tài chính qua mail anh rồi nhé, anh check giúp em.",
        "Dạ ok anh, em note thông tin hồ sơ này lại rồi.",
        "Em cảm ơn anh Mạnh đã phê duyệt trường hợp này ạ!"
      ];
      replyContent = replies[Math.floor(Math.random() * replies.length)];
    } else {
      responder = thread.name.includes("Nhóm") ? "Nguyễn Thảo Chi" : thread.name;
      replyContent = "Dạ vâng, em nhận được tin nhắn trò chuyện rồi ạ. Có gì em sẽ chủ động liên hệ báo cáo nhé!";
    }

    thread.messages.push({
      sender: responder,
      content: replyContent,
      time: timeStr
    });

    // Mark thread as unread if user switched channels during the delay
    if (thread.id !== activeThreadId) {
      thread.unread = (thread.unread || 0) + 1;
    }

    renderThreadList();
    if (thread.id === activeThreadId) {
      renderMessages(activeThreadId);
    }
  };

  // Connect Input & Send Button Hooks
  const msgInput = document.getElementById('chatMessageInput');
  const msgSendBtn = document.getElementById('btnSendChatMessage');

  if (msgInput) {
    msgInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handleSendMessage();
      }
    });
  }

  if (msgSendBtn) {
    msgSendBtn.addEventListener('click', handleSendMessage);
  }

  // Active Chat Search Filter on Sidebar
  const chatSearch = document.getElementById('chatSearchInput');
  if (chatSearch) {
    chatSearch.addEventListener('input', (e) => {
      chatSearchQuery = e.target.value;
      renderThreadList();
    });
  }

  // 5. Group and Friend Modal Operations
  const createGroupModal = document.getElementById('createGroupModal');
  const btnOpenCreateGroup = document.getElementById('btnOpenCreateGroup');
  const btnCloseCreateGroupModal = document.getElementById('btnCloseCreateGroupModal');
  const btnCancelCreateGroup = document.getElementById('btnCancelCreateGroup');
  const createGroupForm = document.getElementById('createGroupForm');

  const addFriendModal = document.getElementById('addFriendModal');
  const btnOpenAddFriend = document.getElementById('btnOpenAddFriend');
  const btnCloseAddFriendModal = document.getElementById('btnCloseAddFriendModal');
  const btnCancelAddFriend = document.getElementById('btnCancelAddFriend');
  const addFriendForm = document.getElementById('addFriendForm');

  // Toggle Create Group Modals
  const toggleCreateGroup = (show) => {
    if (createGroupModal) {
      createGroupModal.style.display = show ? 'flex' : 'none';
      document.body.style.overflow = show ? 'hidden' : '';
      if (!show && createGroupForm) createGroupForm.reset();
    }
  };

  if (btnOpenCreateGroup) btnOpenCreateGroup.addEventListener('click', () => toggleCreateGroup(true));
  if (btnCloseCreateGroupModal) btnCloseCreateGroupModal.addEventListener('click', () => toggleCreateGroup(false));
  if (btnCancelCreateGroup) btnCancelCreateGroup.addEventListener('click', () => toggleCreateGroup(false));

  if (createGroupModal) {
    createGroupModal.addEventListener('click', (e) => {
      if (e.target === createGroupModal) toggleCreateGroup(false);
    });
  }

  // Submission for Group Chat
  if (createGroupForm) {
    createGroupForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const groupName = document.getElementById('newGroupName').value.trim();
      if (!groupName) return;

      const checkedBoxes = document.querySelectorAll('input[name="groupMembers"]:checked');
      const selectedMembers = Array.from(checkedBoxes).map(cb => cb.value);

      // Create new thread in database
      const newThreadId = `group-${chatThreads.length + 1}`;
      const initials = groupName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
      
      const newThread = {
        id: newThreadId,
        name: groupName,
        type: "group",
        avatarInitials: initials || "GP",
        avatarBg: getAvatarBgColor(groupName),
        membersCount: selectedMembers.length + 1, // members + me
        messages: [
          { sender: "Dương Đức Mạnh", content: `Đã tạo nhóm trò chuyện "${groupName}".`, time: "Vừa xong" }
        ]
      };

      chatThreads.unshift(newThread); // Place at top of sidebar
      activeThreadId = newThreadId;

      toggleCreateGroup(false);
      showToast(`Đã tạo nhóm chat "${groupName}" thành công!`, "success");

      renderThreadList();
      renderMessages(activeThreadId);
    });
  }

  // Toggle Add Friend Modals
  const toggleAddFriend = (show) => {
    if (addFriendModal) {
      addFriendModal.style.display = show ? 'flex' : 'none';
      document.body.style.overflow = show ? 'hidden' : '';
      if (!show && addFriendForm) addFriendForm.reset();
    }
  };

  if (btnOpenAddFriend) btnOpenAddFriend.addEventListener('click', () => toggleAddFriend(true));
  if (btnCloseAddFriendModal) btnCloseAddFriendModal.addEventListener('click', () => toggleAddFriend(false));
  if (btnCancelAddFriend) btnCancelAddFriend.addEventListener('click', () => toggleAddFriend(false));

  if (addFriendModal) {
    addFriendModal.addEventListener('click', (e) => {
      if (e.target === addFriendModal) toggleAddFriend(false);
    });
  }

  // Submission for Add Friend
  if (addFriendForm) {
    addFriendForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const friendName = document.getElementById('friendName').value.trim();
      const friendPhone = document.getElementById('friendPhone').value.trim();
      
      if (!friendName || !friendPhone) return;

      const newThreadId = `dm-${chatThreads.length + 1}`;
      const initials = friendName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

      const newThread = {
        id: newThreadId,
        name: friendName,
        type: "dm",
        avatarInitials: initials || "FR",
        avatarBg: getAvatarBgColor(friendName),
        status: "online",
        messages: [
          { sender: friendName, content: "Chào anh Mạnh, em vừa được thêm vào danh bạ chat ThinkEdu ạ.", time: "Vừa xong" }
        ]
      };

      chatThreads.unshift(newThread); // Place at top
      activeThreadId = newThreadId;

      toggleAddFriend(false);
      showToast(`Đã kết bạn với ${friendName} thành công!`, "success");

      renderThreadList();
      renderMessages(activeThreadId);
    });
  }

  // ==========================================
  // NEW CHAT EXTENSION LISTENERS (SEARCH, DROPDOWN, EMOJIS)
  // ==========================================
  
  // 1. Chat Conversation Search Toggles
  const btnToggleChatSearch = document.getElementById('btnToggleChatSearch');
  const chatSearchInline = document.getElementById('chatSearchInline');
  const chatMessageSearchInput = document.getElementById('chatMessageSearchInput');
  const btnCloseInlineSearch = document.getElementById('btnCloseInlineSearch');

  if (btnToggleChatSearch && chatSearchInline) {
    btnToggleChatSearch.addEventListener('click', () => {
      const isHidden = chatSearchInline.style.display === 'none';
      chatSearchInline.style.display = isHidden ? 'flex' : 'none';
      if (isHidden && chatMessageSearchInput) {
        chatMessageSearchInput.focus();
      }
    });
  }

  if (btnCloseInlineSearch && chatSearchInline) {
    btnCloseInlineSearch.addEventListener('click', () => {
      chatSearchInline.style.display = 'none';
      if (chatMessageSearchInput) chatMessageSearchInput.value = '';
      activeChatSearchQuery = "";
      renderMessages(activeThreadId);
    });
  }

  if (chatMessageSearchInput) {
    chatMessageSearchInput.addEventListener('input', (e) => {
      activeChatSearchQuery = e.target.value;
      renderMessages(activeThreadId);
    });
  }

  // 2. Chat Header 3-Dots Dropdown Options Toggler
  const btnToggleChatOptions = document.getElementById('btnToggleChatOptions');
  const chatHeaderDropdown = document.getElementById('chatHeaderDropdown');

  if (btnToggleChatOptions && chatHeaderDropdown) {
    btnToggleChatOptions.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = chatHeaderDropdown.style.display === 'none';
      chatHeaderDropdown.style.display = isHidden ? 'block' : 'none';
      
      // Auto close emoji picker if open
      const chatEmojiPicker = document.getElementById('chatEmojiPicker');
      if (chatEmojiPicker) chatEmojiPicker.style.display = 'none';
    });
  }

  // 3. Emoji Picker Board Toggler
  const btnToggleEmojiPicker = document.getElementById('btnToggleEmojiPicker');
  const chatEmojiPicker = document.getElementById('chatEmojiPicker');

  if (btnToggleEmojiPicker && chatEmojiPicker) {
    btnToggleEmojiPicker.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = chatEmojiPicker.style.display === 'none';
      if (isHidden) {
        renderEmojiPicker();
        chatEmojiPicker.style.display = 'block';
      } else {
        chatEmojiPicker.style.display = 'none';
      }
      
      // Auto close 3-dots dropdown if open
      if (chatHeaderDropdown) chatHeaderDropdown.style.display = 'none';
    });
  }

  // 4. Outside click listeners to auto-dismiss popups
  document.addEventListener('click', (e) => {
    // Dropdown close
    if (chatHeaderDropdown && chatHeaderDropdown.style.display === 'block') {
      if (!chatHeaderDropdown.contains(e.target) && e.target !== btnToggleChatOptions) {
        chatHeaderDropdown.style.display = 'none';
      }
    }
    // Emoji Picker close
    if (chatEmojiPicker && chatEmojiPicker.style.display === 'block') {
      if (!chatEmojiPicker.contains(e.target) && !e.target.closest('#btnToggleEmojiPicker')) {
        chatEmojiPicker.style.display = 'none';
      }
    }
  });

  // 5. Mobile Back Button Toggler to return to Contacts/Sidebar List
  const btnChatMobileBack = document.getElementById('btnChatMobileBack');
  if (btnChatMobileBack) {
    btnChatMobileBack.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const chatCanvas = document.querySelector('.chat-canvas-body');
      if (chatCanvas) {
        chatCanvas.classList.remove('show-conversation');
      }
    });
  }

  // 6. User Profile Menu Hover Items Click Actions (Hồ sơ, Đăng xuất)
  const btnViewProfiles = document.querySelectorAll('.btn-view-my-profile');
  const btnLogoutApps = document.querySelectorAll('.btn-logout-app');

  btnViewProfiles.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showToast("Tài khoản: Dương Đức Mạnh | Vai trò: Quản trị viên hệ thống ThinkEdu.", "info");
    });
  });

  btnLogoutApps.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showLandingPage();
      showToast("Đăng xuất tài khoản quản trị thành công!", "success");
    });
  });
});

