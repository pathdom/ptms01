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
  let students = [
    { id: "HV-2025-062", name: "Nguyễn Minh Đăng", gender: "Nam", phone: "0982560306", program: "Điện tử", status: "Đã trúng tuyển", japanese: "N1" },
    { id: "HV-2025-061", name: "Nguyễn Đình Châu", gender: "Nam", phone: "0987657651", program: "Hàn công nghiệp", status: "Đang học", japanese: "N4" },
    { id: "HV-2025-060", name: "Nguyễn Đức Bảo", gender: "Nam", phone: "0982560306", program: "Điện tử", status: "Đã trúng tuyển", japanese: "N5" },
    { id: "HV-2025-059", name: "Trung Văn Tuyên", gender: "Nam", phone: "0999888777", program: "Chăm sóc người cao tuổi", status: "Mới đăng ký", japanese: "N4" },
    { id: "HV-2025-058", name: "Trần Quốc Hưng", gender: "Nam", phone: "0912341049", program: "Chăm sóc người cao tuổi", status: "Đang học", japanese: "N3" },
    { id: "HV-2025-057", name: "Lý Bảo Ngọc", gender: "Nữ", phone: "0912341048", program: "Kỹ thuật CNC", status: "Mới đăng ký", japanese: "N5" },
    { id: "HV-2025-056", name: "Nguyễn Thành Đạt", gender: "Nam", phone: "0912341047", program: "Nông nghiệp", status: "Đã xuất cảnh", japanese: "N2" },
    { id: "HV-2025-055", name: "Đỗ Ngọc Trâm", gender: "Nữ", phone: "0912341046", program: "Xây dựng", status: "Chờ phỏng vấn", japanese: "N4" },
    { id: "HV-2025-054", name: "Võ Anh Khoa", gender: "Nam", phone: "0912341045", program: "Dệt may", status: "Đang học", japanese: "N4" },
    { id: "HV-2025-053", name: "Hoàng Gia Linh", gender: "Nữ", phone: "0912341044", program: "Điện tử", status: "Đang học", japanese: "N4" },
    
    { id: "HV-2025-052", name: "Mai Thị Quỳnh", gender: "Nữ", phone: "0981234567", program: "Khách sạn", status: "Mới đăng ký", japanese: "N5" },
    { id: "HV-2025-051", name: "Phan Thanh Sơn", gender: "Nam", phone: "0911222333", program: "Xây dựng", status: "Chờ phỏng vấn", japanese: "N5" },
    { id: "HV-2025-050", name: "Nguyễn Thị Lan", gender: "Nữ", phone: "0987111111", program: "Chăm sóc người cao tuổi", status: "Đang học", japanese: "N4" },
    { id: "HV-2025-049", name: "Đinh Tiến Dũng", gender: "Nam", phone: "0908111222", program: "Kỹ thuật CNC", status: "Đã xuất cảnh", japanese: "N2" },
    { id: "HV-2025-048", name: "Trần Minh Quân", gender: "Nam", phone: "0987222222", program: "Điện tử", status: "Đang học", japanese: "N4" },
    { id: "HV-2025-047", name: "Hồ Sĩ Đạt", gender: "Nam", phone: "0971234567", program: "Cơ khí", status: "Mới đăng ký", japanese: "N5" },
    { id: "HV-2025-046", name: "Trần Thị Hạnh", gender: "Nữ", phone: "0922333444", program: "Nông nghiệp", status: "Chờ phỏng vấn", japanese: "N4" },
    { id: "HV-2025-045", name: "Lê Văn Tám", gender: "Nam", phone: "0905123456", program: "Cơ khí", status: "Đã trúng tuyển", japanese: "N3" },
    { id: "HV-2025-044", name: "Lê Thị Thu", gender: "Nữ", phone: "0987333333", program: "Khách sạn", status: "Đang học", japanese: "N3" },
    { id: "HV-2025-043", name: "Trần Tuấn Tú", gender: "Nam", phone: "0961234567", program: "Xây dựng", status: "Mới đăng ký", japanese: "N4" },
    
    { id: "HV-2025-042", name: "Phạm Văn Sơn", gender: "Nam", phone: "0987444444", program: "Xây dựng", status: "Đang học", japanese: "N4" },
    { id: "HV-2025-041", name: "Trần Phương Thảo", gender: "Nữ", phone: "0919222333", program: "Chăm sóc người cao tuổi", status: "Đã xuất cảnh", japanese: "N1" },
    { id: "HV-2025-040", name: "Hoàng Văn Tuấn", gender: "Nam", phone: "0987555555", program: "Hàn công nghiệp", status: "Đang học", japanese: "N4" },
    { id: "HV-2025-039", name: "Ngô Quốc Bảo", gender: "Nam", phone: "0933444555", program: "Dệt may", status: "Chờ phỏng vấn", japanese: "N5" },
    { id: "HV-2025-038", name: "Phạm Thùy Chi", gender: "Nữ", phone: "0932888999", program: "Khách sạn", status: "Đã trúng tuyển", japanese: "N2" },
    { id: "HV-2025-037", name: "Nguyễn Thị Đào", gender: "Nữ", phone: "0951234567", program: "Dệt may", status: "Mới đăng ký", japanese: "N5" },
    { id: "HV-2025-036", name: "Nguyễn Thị Ngọc", gender: "Nữ", phone: "0987666666", program: "Cơ khí", status: "Đang học", japanese: "N3" },
    { id: "HV-2025-035", name: "Trần Văn Bình", gender: "Nam", phone: "0987777777", program: "Nông nghiệp", status: "Đang học", japanese: "N4" },
    { id: "HV-2025-034", name: "Lê Minh Hùng", gender: "Nam", phone: "0987888888", program: "Dệt may", status: "Đang học", japanese: "N4" },
    { id: "HV-2025-033", name: "Phạm Thị Tuyết", gender: "Nữ", phone: "0987999999", program: "Điện tử", status: "Đang học", japanese: "N3" },
    
    { id: "HV-2025-032", name: "Dương Hoài Nam", gender: "Nam", phone: "0944555666", program: "Hàn công nghiệp", status: "Chờ phỏng vấn", japanese: "N4" },
    { id: "HV-2025-031", name: "Hoàng Minh Đức", gender: "Nam", phone: "0987000000", program: "Chăm sóc người cao tuổi", status: "Đang học", japanese: "N4" },
    { id: "HV-2025-030", name: "Nguyễn Văn Hùng", gender: "Nam", phone: "0929333444", program: "Xây dựng", status: "Đã xuất cảnh", japanese: "N3" },
    { id: "HV-2025-029", name: "Lâm Vĩnh Khang", gender: "Nam", phone: "0941234567", program: "Điện tử", status: "Mới đăng ký", japanese: "N4" },
    { id: "HV-2025-028", name: "Nguyễn Văn Hải", gender: "Nam", phone: "0986111111", program: "Xây dựng", status: "Đang học", japanese: "N3" },
    { id: "HV-2025-027", name: "Trần Thị Hương", gender: "Nữ", phone: "0986222222", program: "Nông nghiệp", status: "Đang học", japanese: "N4" },
    { id: "HV-2025-026", name: "Lê Văn Nam", gender: "Nam", phone: "0986333333", program: "Hàn công nghiệp", status: "Đang học", japanese: "N4" },
    { id: "HV-2025-025", name: "Vũ Hoàng Long", gender: "Nam", phone: "0918777666", program: "Điện tử", status: "Đã trúng tuyển", japanese: "N4" },
    { id: "HV-2025-024", name: "Phạm Thị Thùy", gender: "Nữ", phone: "0986444444", program: "Khách sạn", status: "Đang học", japanese: "N3" },
    { id: "HV-2025-023", name: "Tống Khánh Linh", gender: "Nữ", phone: "0955666777", program: "Khách sạn", status: "Chờ phỏng vấn", japanese: "N3" },
    
    { id: "HV-2025-022", name: "Đỗ Thùy Trang", gender: "Nữ", phone: "0931234567", program: "Chăm sóc người cao tuổi", status: "Mới đăng ký", japanese: "N5" },
    { id: "HV-2025-021", name: "Lê Minh Triết", gender: "Nam", phone: "0939444555", program: "Điện tử", status: "Đã xuất cảnh", japanese: "N2" },
    { id: "HV-2025-020", name: "Hoàng Anh Tuấn", gender: "Nam", phone: "0986555555", program: "Điện tử", status: "Đang học", japanese: "N4" },
    { id: "HV-2025-019", name: "Nguyễn Thị Mai", gender: "Nữ", phone: "0986666666", program: "Cơ khí", status: "Đang học", japanese: "N4" },
    { id: "HV-2025-018", name: "Đặng Thị Mai", gender: "Nữ", phone: "0988666555", program: "Chăm sóc người cao tuổi", status: "Đã trúng tuyển", japanese: "N3" },
    { id: "HV-2025-017", name: "Trần Văn Long", gender: "Nam", phone: "0986777777", program: "Xây dựng", status: "Đang học", japanese: "N4" },
    { id: "HV-2025-016", name: "Phan Văn Đức", gender: "Nam", phone: "0921234567", program: "Nông nghiệp", status: "Mới đăng ký", japanese: "N5" },
    { id: "HV-2025-015", name: "Trương Công Phượng", gender: "Nam", phone: "0966777888", program: "Nông nghiệp", status: "Chờ phỏng vấn", japanese: "N4" },
    { id: "HV-2025-014", name: "Cao Minh Quân", gender: "Nam", phone: "0911234567", program: "Khách sạn", status: "Mới đăng ký", japanese: "N4" },
    { id: "HV-2025-013", name: "Lê Thị Thảo", gender: "Nữ", phone: "0986888888", program: "Chăm sóc người cao tuổi", status: "Đang học", japanese: "N3" },
    
    { id: "HV-2025-012", name: "Phạm Hồng Nhung", gender: "Nữ", phone: "0949555666", program: "Nông nghiệp", status: "Đã xuất cảnh", japanese: "N3" },
    { id: "HV-2025-011", name: "Đào Duy Anh", gender: "Nam", phone: "0977888999", program: "Điện tử", status: "Chờ phỏng vấn", japanese: "N5" },
    { id: "HV-2025-010", name: "Bùi Minh Tú", gender: "Nam", phone: "0977555444", program: "Kỹ thuật CNC", status: "Đã trúng tuyển", japanese: "N4" }
  ];

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

  // Breadcrumbs Home Link
  const breadcrumbHome = document.querySelector('.breadcrumb-home-link');

  /* ==========================================
     SPA ROUTING & NAVIGATION CONTROLLER
     ========================================== */
  const showDashboard = () => {
    // Hide Landing Page
    mainLanding.style.display = 'none';
    footerLanding.style.display = 'none';
    
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
    // Show Landing Page
    mainLanding.style.display = 'block';
    footerLanding.style.display = 'block';
    
    // Hide Dashboard
    overviewDashboard.style.display = 'none';
    
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

  // Nav Item click hooks
  if (btnOverview) {
    btnOverview.addEventListener('click', (e) => {
      e.preventDefault();
      showDashboard();
    });
  }

  // Connect normal landing page navigation to show landing page
  document.querySelectorAll('nav a').forEach(link => {
    if (link.id !== 'btn-overview') {
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
  if (breadcrumbHome) {
    breadcrumbHome.addEventListener('click', (e) => {
      e.preventDefault();
      showLandingPage();
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
        showToast(`Xem hồ sơ học viên: ${student.name} (${student.id})`, 'info');
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
      const newNum = students.length + 10;
      const newId = `HV-2025-0${newNum}`;

      // Insert new student into array
      const newStudent = {
        id: newId,
        name: fullname,
        gender: gender,
        phone: phone,
        program: program,
        status: status,
        japanese: japanese
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
        btnExportExcel.disabled = false;
        btnExportExcel.innerHTML = originalText;
        
        // Render dummy CSV/Excel download
        showToast("Đã trích xuất và tải xuống danh sách học viên thành công (Định dạng Excel/CSV)!", "success");
      }, 1200);
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
});
