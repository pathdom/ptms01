document.addEventListener('DOMContentLoaded', () => {

  // Helper padding function
  const pad = (num, size) => {
    let s = num + "";
    while (s.length < size) s = "0" + s;
    return s;
  };

  // Avatar background color picker helper
  const getAvatarBgColor = (name) => {
    const colors = ['#4A90E2', '#50E3C2', '#F5A623', '#D0021B', '#7ED321', '#9013FE', '#BD10E0', '#4A4A4A'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const idx = Math.abs(hash) % colors.length;
    return colors[idx];
  };

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

    setTimeout(() => {
      if (toast.parentElement) {
        toast.classList.add('toast-fade-out');
        setTimeout(() => toast.remove(), 400);
      }
    }, 4000);
  };

  /* ==========================================================================
     TELEGRAM-STYLE CHAT SYSTEM LOGIC & DATA (TRANSITIONED TO FIREBASE)
     ========================================================================== */
  
  // Single Shared group chat thread
  let chatThreads = [
    {
      id: "group-global",
      name: "Group Chat Tổng Hợp ThinkEdu",
      type: "group",
      avatarInitials: "GT",
      avatarBg: "var(--accent)",
      membersCount: "Tất cả",
      messages: []
    }
  ];

  let activeThreadId = "group-global";
  let chatSearchQuery = "";
  let activeChatSearchQuery = ""; // Query for highlighting inside the conversation

  // Render Thread List Sidebar
  const renderThreadList = () => {
    const listContainer = document.getElementById('chatThreadsList');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    const query = chatSearchQuery.trim().toLowerCase();
    
    const filteredThreads = chatThreads.filter(t => {
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

      const div = document.createElement('div');
      div.className = `chat-thread-item ${activeClass}`;
      div.innerHTML = `
        <div class="avatar-circle" style="background-color: ${thread.avatarBg};">${thread.avatarInitials}</div>
        <div class="chat-thread-details">
          <div class="chat-thread-header">
            <span class="title">${thread.name}</span>
            <span class="time">${lastMsg.time}</span>
          </div>
          <div class="chat-thread-preview">
            <span class="message">${lastMsg.sender ? lastMsg.sender + ': ' : ''}${lastMsg.content}</span>
          </div>
        </div>
      `;

      listContainer.appendChild(div);
    });
  };

  // Render Messages in active thread
  const renderMessages = (threadId) => {
    const thread = chatThreads.find(t => t.id === threadId);
    const container = document.getElementById('chatMessagesContainer');
    if (!thread || !container) return;

    // Update Header Info dynamically
    const header = document.getElementById('chatWindowHeader');
    if (header) {
      const avatarCircle = header.querySelector('#activeChatAvatar');
      const titleText = header.querySelector('#activeChatTitle');
      const statusSpan = header.querySelector('#activeChatMembersCount');

      if (avatarCircle) {
        avatarCircle.textContent = thread.avatarInitials;
        avatarCircle.style.backgroundColor = thread.avatarBg;
      }
      if (titleText) titleText.textContent = thread.name;
      if (statusSpan) statusSpan.textContent = "Cập nhật thời gian thực";
    }

    // Render bubbles
    container.innerHTML = '';
    
    thread.messages.forEach(msg => {
      const activeName = (currentUser && currentUser.name) ? `${currentUser.name} (${currentUser.role === 'admin' ? 'quản trị viên' : 'nhân viên'})` : "";
      const isSentByMe = (msg.sender === activeName);
      
      const bubbleRow = document.createElement('div');
      bubbleRow.className = `chat-bubble-row ${isSentByMe ? 'sent' : 'received'}`;
      
      let receivedAvatar = '';
      let senderLabel = '';
      
      if (!isSentByMe) {
        const initials = msg.sender.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        const avatarBg = getAvatarBgColor(msg.sender);
        receivedAvatar = `<div class="avatar-circle" style="background-color: ${avatarBg}; font-size: 0.7rem;">${initials}</div>`;
        senderLabel = `<span class="sender-name">${msg.sender}</span>`;
      }

      // Highlight text matches if conversation search query exists
      let displayContent = msg.content;
      if (activeChatSearchQuery && msg.content) {
        const escapedQuery = activeChatSearchQuery.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`(${escapedQuery})`, 'gi');
        displayContent = msg.content.replace(regex, '<span class="highlight-match">$1</span>');
      }

      let displayImage = "";
      if (msg.image) {
        displayImage = `<div class="chat-message-image-container" style="margin-bottom: 0.5rem; overflow: hidden; border-radius: var(--border-radius-sm); cursor: pointer;"><img src="${msg.image}" style="max-width: 100%; max-height: 250px; display: block; object-fit: cover; border-radius: var(--border-radius-sm);" class="chat-image-preview"></div>`;
      }

      bubbleRow.innerHTML = `
        ${receivedAvatar}
        <div class="chat-bubble" style="border-radius: var(--border-radius-md);">
          ${senderLabel}
          ${displayImage}
          ${msg.content ? `<div class="content">${displayContent}</div>` : ''}
          <span class="time-stamp">${msg.time}</span>
        </div>
      `;
      
      container.appendChild(bubbleRow);
    });

    // Auto scroll to bottom
    container.scrollTop = container.scrollHeight;
  };

  // 3. Emoji Picker Board Toggler
  const emojis = ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈', '👿', '👹', '👺', '🤡', '💩', '👻', '💀', '☠️', '👽', '👾', '🤖', '🎃', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾'];
  const renderEmojiPicker = () => {
    const picker = document.getElementById('chatEmojiPicker');
    if (!picker) return;
    picker.innerHTML = '';
    
    const grid = document.createElement('div');
    grid.className = 'chat-emoji-grid';
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(8, 1fr)';
    grid.style.gap = '6px';
    grid.style.padding = '10px';
    grid.style.maxHeight = '200px';
    grid.style.overflowY = 'auto';

    emojis.forEach(emoji => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.style.background = 'none';
      btn.style.border = 'none';
      btn.style.fontSize = '1.3rem';
      btn.style.cursor = 'pointer';
      btn.style.padding = '4px';
      btn.textContent = emoji;
      btn.addEventListener('click', () => {
        const input = document.getElementById('chatMessageInput');
        if (input) {
          input.value += emoji;
          input.focus();
        }
        picker.style.display = 'none';
      });
      grid.appendChild(btn);
    });
    picker.appendChild(grid);
  };

  // Search threads
  const chatSearch = document.getElementById('chatSearchInput');
  if (chatSearch) {
    chatSearch.addEventListener('input', (e) => {
      chatSearchQuery = e.target.value;
      renderThreadList();
    });
  }

  // Search inline messages
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

  // Emoji picker show/hide
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
    });
  }

  document.addEventListener('click', (e) => {
    if (chatEmojiPicker && chatEmojiPicker.style.display === 'block') {
      if (!chatEmojiPicker.contains(e.target) && !e.target.closest('#btnToggleEmojiPicker')) {
        chatEmojiPicker.style.display = 'none';
      }
    }
  });


  /* ==========================================================================
     ADMIN PORTAL - FIREBASE INTEGRATION (AUTH, REAL-TIME CHAT, STATS & USER CRUD)
     ========================================================================== */

  // 1. Initialize Firebase
  const firebaseConfig = {
    apiKey: "AIzaSyC3wwnvpQwHX6UZcgXIShan5qJ7waR1Ccs",
    authDomain: "box-chat-noi-bo.firebaseapp.com",
    projectId: "box-chat-noi-bo",
    storageBucket: "box-chat-noi-bo.firebasestorage.app",
    messagingSenderId: "867982221264",
    appId: "1:867982221264:web:63f22689b875e699fbe3d5",
    measurementId: "G-P6QLZD5P4Y"
  };

  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  
  // Set persistence to NONE so the session is never saved in storage (always log in on refresh/new tab)
  auth.setPersistence(firebase.auth.Auth.Persistence.NONE)
    .catch((err) => console.error("Error setting Firebase persistence to NONE:", err));

  const db = firebase.firestore();

  let currentUser = null;
  let chatSubscription = null;

  // Attempt to automatically pre-create/register the default admin account on startup
  const setupDefaultAdmin = async () => {
    try {
      const userCredential = await auth.createUserWithEmailAndPassword("admin@domain.com", "Admin123456@");
      const uid = userCredential.user.uid;
      await db.collection("users").doc(uid).set({
        name: "Admin ThinkEdu",
        email: "admin@domain.com",
        role: "admin",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      console.log("Default admin account successfully initialized.");
      await auth.signOut(); // Ensure we don't remain logged in as admin automatically
    } catch (error) {
      if (error.code === 'auth/operation-not-allowed') {
        setTimeout(() => {
          showToast("LỖI HỆ THỐNG: Vui lòng vào Firebase Console -> Authentication -> Sign-in method -> BẬT 'Email/Password' để hoạt động!", "error");
        }, 1000);
      }
      console.log("Admin account setup status:", error.message);
    }
  };
  setupDefaultAdmin();

  // 2. Auth & UI Elements
  const loginContainer = document.getElementById('login-container');
  const appRoot = document.getElementById('app-root');
  const portalLoginForm = document.getElementById('portalLoginForm');
  const btnTogglePassword = document.getElementById('btnTogglePassword');
  const loginPasswordInput = document.getElementById('loginPassword');

  // Toggle Password Eye Icon
  if (btnTogglePassword && loginPasswordInput) {
    btnTogglePassword.addEventListener('click', () => {
      const isPassword = loginPasswordInput.type === 'password';
      loginPasswordInput.type = isPassword ? 'text' : 'password';
      btnTogglePassword.classList.toggle('active', isPassword);
    });
  }

  // Sync Logged-In User Information across Sidebar & Mini-headers
  const syncUserInfoUI = (user) => {
    const avatarInitials = user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    const displayRole = user.role === 'admin' ? 'Quản trị viên' : 'Nhân viên';

    // Helper function to sync avatar elements with optional custom image
    const syncAvatarElement = (elementId) => {
      const el = document.getElementById(elementId);
      if (!el) return;
      if (user.avatar) {
        el.innerHTML = `<img src="${user.avatar}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
        el.style.backgroundColor = "transparent";
      } else {
        el.textContent = avatarInitials;
        el.style.backgroundColor = getAvatarBgColor(user.name);
      }
    };

    // Sidebar Badge
    syncAvatarElement('portalUserAvatar');
    const sidebarName = document.getElementById('portalUserName');
    const sidebarRole = document.getElementById('portalUserRole');
    if (sidebarName) sidebarName.textContent = user.name;
    if (sidebarRole) sidebarRole.textContent = displayRole;

    // Mini Chat header
    syncAvatarElement('miniChatAvatar');
    const miniChatName = document.getElementById('miniChatName');
    const miniChatRole = document.getElementById('miniChatRole');
    if (miniChatName) miniChatName.textContent = user.name;
    if (miniChatRole) miniChatRole.textContent = displayRole;

    // Mini Users header
    syncAvatarElement('miniUsersAvatar');
    const miniUsersName = document.getElementById('miniUsersName');
    const miniUsersRole = document.getElementById('miniUsersRole');
    if (miniUsersName) miniUsersName.textContent = user.name;
    if (miniUsersRole) miniUsersRole.textContent = displayRole;

    // Mini Students header
    syncAvatarElement('miniStudentsAvatar');
    const miniStudentsName = document.getElementById('miniStudentsName');
    const miniStudentsRole = document.getElementById('miniStudentsRole');
    if (miniStudentsName) miniStudentsName.textContent = user.name;
    if (miniStudentsRole) miniStudentsRole.textContent = displayRole;

    // Mini Student Users header
    syncAvatarElement('miniStudentUsersAvatar');
    const miniStudentUsersName = document.getElementById('miniStudentUsersName');
    const miniStudentUsersRole = document.getElementById('miniStudentUsersRole');
    if (miniStudentUsersName) miniStudentUsersName.textContent = user.name;
    if (miniStudentUsersRole) miniStudentUsersRole.textContent = displayRole;

    // Role-based Access Controls (Admin Only "Tạo tài khoản NV" & "Tạo tài khoản HV")
    const menuItemCreateUsers = document.getElementById('menuItemCreateUsers');
    const menuItemCreateStudentUsers = document.getElementById('menuItemCreateStudentUsers');
    if (user.role === 'admin') {
      if (menuItemCreateUsers) menuItemCreateUsers.style.display = 'flex';
      if (menuItemCreateStudentUsers) menuItemCreateStudentUsers.style.display = 'flex';
    } else {
      if (menuItemCreateUsers) menuItemCreateUsers.style.display = 'none';
      if (menuItemCreateStudentUsers) menuItemCreateStudentUsers.style.display = 'none';
    }
  };

  // Perform Firebase Auth Login action
  const handlePortalLogin = async (email, password) => {
    try {
      await auth.signInWithEmailAndPassword(email, password);
      showToast("Đăng nhập thành công!", "success");
    } catch (error) {
      console.error("Login failed:", error);
      
      // Auto-create admin if logging in with admin@domain.com for the first time
      if (email === 'admin@domain.com' && error.code === 'auth/user-not-found') {
        try {
          showToast("Đang tự động khởi tạo tài khoản Admin...", "info");
          const userCredential = await auth.createUserWithEmailAndPassword(email, password);
          const uid = userCredential.user.uid;
          await db.collection("users").doc(uid).set({
            name: "Admin ThinkEdu",
            email: "admin@domain.com",
            role: "admin",
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          showToast("Khởi tạo tài khoản Admin thành công! Đang tự động đăng nhập...", "success");
          // Firebase automatically signs in the user upon creation. We sync session naturally.
          return;
        } catch (createErr) {
          console.error("Failed to auto-create admin:", createErr);
          if (createErr.code === 'auth/operation-not-allowed') {
            showToast("LỖI HỆ THỐNG: Vui lòng vào Firebase Console -> Authentication -> Sign-in method -> BẬT 'Email/Password'!", "error");
          } else {
            showToast("Lỗi khởi tạo Admin: " + createErr.message, "error");
          }
          return;
        }
      }

      let errorMsg = "Tên đăng nhập hoặc mật khẩu không chính xác!";
      if (error.code === 'auth/operation-not-allowed') {
        errorMsg = "LỖI HỆ THỐNG: Đăng nhập bằng Email/Mật khẩu chưa được kích hoạt trên Firebase Console của bạn. Vui lòng vào Console -> Authentication -> Sign-in method -> bật 'Email/Password'!";
      } else if (error.code === 'auth/invalid-email') {
        errorMsg = "Địa chỉ email không hợp lệ!";
      } else if (error.code === 'auth/user-not-found') {
        errorMsg = "Không tìm thấy tài khoản đăng ký với email này!";
      } else if (error.code === 'auth/wrong-password') {
        errorMsg = "Mật khẩu không chính xác!";
      } else {
        errorMsg = `Lỗi Firebase (${error.code}): ${error.message}`;
      }
      showToast(errorMsg, "error");
    }
  };

  // Bind Submit login form
  if (portalLoginForm) {
    portalLoginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const emailVal = document.getElementById('loginUsername').value.trim();
      const passwordVal = document.getElementById('loginPassword').value;
      handlePortalLogin(emailVal, passwordVal);
    });
  }

  // 3. Sidebar View Switcher Logic
  const switchPortalView = (targetViewId) => {
    // Hide all dashboards
    document.querySelectorAll('.dashboard-wrapper').forEach(wrapper => {
      wrapper.style.display = 'none';
    });

    // Show selected dashboard
    const targetElement = document.getElementById(targetViewId);
    if (targetElement) {
      targetElement.style.display = 'block';
    }

    // Update active nav menu link styling
    document.querySelectorAll('.sidebar-menu .menu-item').forEach(item => {
      item.classList.remove('active');
      if (item.getAttribute('data-target') === targetViewId) {
        item.classList.add('active');
      }
    });

    // Initialize specific module views when active
    if (targetViewId === 'chat-dashboard') {
      renderThreadList();
      renderMessages(activeThreadId);
    } else if (targetViewId === 'users-dashboard') {
      renderStaffUsersList();
    } else if (targetViewId === 'student-users-dashboard') {
      renderStudentUsersList();
    } else if (targetViewId === 'students-dashboard') {
      applyStudentFiltersAndRender();
    }
  };

  // Bind Menu Click Toggles
  document.querySelectorAll('.sidebar-menu .menu-item').forEach(item => {
    item.addEventListener('click', () => {
      const target = item.getAttribute('data-target');
      switchPortalView(target);
    });
  });

  // Dark Theme support in Sidebar bottom controls
  const darkModeTogglePortal = document.getElementById('darkModeTogglePortal');
  if (darkModeTogglePortal) {
    darkModeTogglePortal.addEventListener('click', () => {
      document.body.classList.toggle('dark-theme-crm');
      const isDark = document.body.classList.contains('dark-theme-crm');
      showToast(isDark ? "Đã chuyển sang giao diện tối!" : "Đã chuyển sang giao diện sáng!", "info");
    });
  }

  // Logout actions
  const handlePortalLogout = async () => {
    try {
      if (chatSubscription) {
        chatSubscription(); // Unsubscribe chat
        chatSubscription = null;
      }
      await auth.signOut();
      if (portalLoginForm) portalLoginForm.reset();
      showToast("Bạn đã đăng xuất tài khoản thành công!", "info");
    } catch (e) {
      console.error("Logout failed:", e);
    }
  };

  const btnLogoutPortal = document.getElementById('btnLogoutPortal');
  if (btnLogoutPortal) {
    btnLogoutPortal.addEventListener('click', handlePortalLogout);
  }

  // Support breadcrumb home redirection to Chat
  document.querySelectorAll('.portal-breadcrumb-home').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      switchPortalView('chat-dashboard');
    });
  });

  // 5. Staff User management Module (Admin Only) - Loaded from Firestore
  const renderStaffUsersList = async () => {
    const tableBody = document.getElementById('staffUsersTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    try {
      const snapshot = await db.collection("users").orderBy("createdAt", "desc").get();
      const staffMembers = [];
      snapshot.forEach(doc => {
        const user = doc.data();
        user.uid = doc.id;
        // Do not list default admin in user creation list to avoid accidental self-deletion
        if (user.email !== 'admin@domain.com') {
          staffMembers.push(user);
        }
      });

      if (staffMembers.length === 0) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="5" style="text-align:center; padding: 2rem; color:var(--text-muted); font-size:0.85rem;">
              Chưa có tài khoản nhân viên nào được tạo.
            </td>
          </tr>
        `;
        return;
      }

      staffMembers.forEach(user => {
        const tr = document.createElement('tr');
        let dateString = "Chưa rõ";
        if (user.createdAt) {
          try {
            dateString = user.createdAt.toDate().toLocaleDateString('vi-VN');
          } catch(e) {}
        }
        
        tr.innerHTML = `
          <td style="text-align: center;"><strong>${user.name}</strong><br><span style="font-size:0.7rem; color:var(--text-muted);">Tạo ngày: ${dateString}</span></td>
          <td style="text-align: center;"><span class="font-mono" style="font-weight:500;">${user.email}</span></td>
          <td style="text-align: center;"><span class="font-mono" style="color:var(--text-muted); font-weight:500;">********</span></td>
          <td style="text-align: center;"><span class="crm-badge badge-danghoc">Nhân viên</span></td>
          <td style="text-align: center;">
            <button class="action-icon-btn btn-delete-staff" data-uid="${user.uid}" title="Xóa tài khoản" style="color:#EF4444; background:none; border:none; cursor:pointer; padding:6px; border-radius:50%;">
              <svg viewBox="0 0 24 24" style="width: 18px; height: 18px; fill: currentColor;"><path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/></svg>
            </button>
          </td>
        `;

        // Connect delete user click hook (deletes user document from Firestore)
        tr.querySelector('.btn-delete-staff').addEventListener('click', async () => {
          if (confirm(`Bạn có chắc chắn muốn xóa tài khoản nhân viên ${user.name} (${user.email})?`)) {
            try {
              await db.collection("users").doc(user.uid).delete();
              showToast(`Đã xóa tài khoản nhân viên ${user.name} thành công!`, "warning");
              renderStaffUsersList();
            } catch (err) {
              console.error("Failed to delete staff:", err);
              showToast("Lỗi khi xóa tài khoản nhân viên!", "error");
            }
          }
        });

        tableBody.appendChild(tr);
      });
    } catch (e) {
      console.error("Failed to load staff list:", e);
    }
  };

  // Secondary Firebase instance to create new staff users without logging out current Admin
  const handleCreateStaffUser = async (email, password, name) => {
    const secondaryAppName = "secondary_" + Math.random().toString(36).substring(7);
    const secondaryApp = firebase.initializeApp(firebaseConfig, secondaryAppName);
    const secondaryAuth = secondaryApp.auth();

    try {
      // 1. Create user in Firebase Authentication
      const userCredential = await secondaryAuth.createUserWithEmailAndPassword(email, password);
      const newUid = userCredential.user.uid;

      // 2. Write role and data to Firestore users collection
      await db.collection("users").doc(newUid).set({
        name: name,
        email: email,
        role: "staff",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      showToast(`Đã tạo tài khoản nhân viên cho ${name} thành công!`, "success");
      
      // 3. Log out secondary instance and delete app context
      await secondaryAuth.signOut();
      await secondaryApp.delete();

      // 4. Reset create user form & reload list
      const createForm = document.getElementById('createStaffUserForm');
      if (createForm) createForm.reset();
      renderStaffUsersList();
    } catch (error) {
      console.error("Error creating secondary user:", error);
      showToast("Lỗi tạo tài khoản: " + error.message, "error");
      
      // Guarantee clean up on exception
      try {
        await secondaryAuth.signOut();
        await secondaryApp.delete();
      } catch (e) {}
    }
  };

  // Bind Submit Create Staff User Form
  const createStaffUserForm = document.getElementById('createStaffUserForm');
  if (createStaffUserForm) {
    createStaffUserForm.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const newName = document.getElementById('newStaffName').value.trim();
      const newEmail = document.getElementById('newStaffEmail').value.trim().toLowerCase();
      const newPassword = document.getElementById('newStaffPassword').value;

      if (!newName || !newEmail || !newPassword) {
        showToast("Vui lòng điền đầy đủ các thông tin!", "error");
        return;
      }

      if (newPassword.length < 6) {
        showToast("Mật khẩu phải tối thiểu 6 ký tự!", "error");
        return;
      }

      handleCreateStaffUser(newEmail, newPassword, newName);
    });
  }

  // 5.5. Student User management Module (Admin Only) - Loaded from Firestore
  const renderStudentUsersList = async () => {
    const tableBody = document.getElementById('studentUsersTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    try {
      const snapshot = await db.collection("users").where("role", "==", "student").get();
      const studentUsers = [];
      snapshot.forEach(doc => {
        const user = doc.data();
        user.uid = doc.id;
        studentUsers.push(user);
      });

      if (studentUsers.length === 0) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="5" style="text-align:center; padding: 2rem; color:var(--text-muted); font-size:0.85rem;">
              Chưa có tài khoản học viên nào được tạo.
            </td>
          </tr>
        `;
        return;
      }

      // Query student profiles to match code/details
      const profilesSnapshot = await db.collection("students").get();
      const profilesMap = {};
      profilesSnapshot.forEach(doc => {
        const p = doc.data();
        profilesMap[p.email.toLowerCase()] = p;
      });

      studentUsers.forEach(user => {
        const profile = profilesMap[user.email.toLowerCase()] || {};
        const code = profile.code || "TE-Chưa rõ";
        const country = profile.country || "Chưa rõ";
        const status = profile.status || "Đang học";

        let badgeClass = "badge-danghoc";
        if (status === "Chờ phỏng vấn") badgeClass = "badge-waiting";
        else if (status === "Đã trúng tuyển") badgeClass = "badge-selected";
        else if (status === "Đang làm hồ sơ") badgeClass = "badge-processing";

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="text-align: center;"><strong>${user.name}</strong><br><span style="font-size:0.75rem; font-family: monospace; color:var(--accent); font-weight: 600;">${code}</span></td>
          <td style="text-align: center;"><span class="font-mono" style="font-weight:500;">${user.email}</span></td>
          <td style="text-align: center;"><strong>${country}</strong></td>
          <td style="text-align: center;"><span class="crm-badge ${badgeClass}">${status}</span></td>
          <td style="text-align: center;">
            <button class="action-icon-btn btn-delete-student-user" data-uid="${user.uid}" data-email="${user.email}" title="Xóa tài khoản" style="color:#EF4444; background:none; border:none; cursor:pointer; padding:6px; border-radius:50%;">
              <svg viewBox="0 0 24 24" style="width: 18px; height: 18px; fill: currentColor;"><path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/></svg>
            </button>
          </td>
        `;

        tr.querySelector('.btn-delete-student-user').addEventListener('click', async () => {
          if (confirm(`Bạn có chắc chắn muốn xóa tài khoản học viên ${user.name} (${user.email})? Thao tác này cũng sẽ xóa hồ sơ tư vấn tương ứng.`)) {
            try {
              // Delete from users collection
              await db.collection("users").doc(user.uid).delete();
              
              // Find and delete from students collection
              const pSnap = await db.collection("students").where("email", "==", user.email).get();
              pSnap.forEach(async (pDoc) => {
                await db.collection("students").doc(pDoc.id).delete();
              });

              showToast(`Đã xóa tài khoản học viên ${user.name} thành công!`, "warning");
              renderStudentUsersList();
            } catch (err) {
              console.error("Failed to delete student user:", err);
              showToast("Lỗi khi xóa tài khoản học viên!", "error");
            }
          }
        });

        tableBody.appendChild(tr);
      });
    } catch (e) {
      console.error("Failed to load student users list:", e);
    }
  };

  const handleCreateStudentUser = async (email, password, name, code, phone, country, status, notes) => {
    const secondaryAppName = "secondary_student_" + Math.random().toString(36).substring(7);
    const secondaryApp = firebase.initializeApp(firebaseConfig, secondaryAppName);
    const secondaryAuth = secondaryApp.auth();

    try {
      // 1. Create user in Firebase Authentication
      const userCredential = await secondaryAuth.createUserWithEmailAndPassword(email, password);
      const newUid = userCredential.user.uid;

      // 2. Write role and data to Firestore users collection
      await db.collection("users").doc(newUid).set({
        name: name,
        email: email,
        role: "student",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      // 3. Write profile to Firestore students collection
      await db.collection("students").add({
        code: code,
        name: name,
        email: email,
        phone: phone,
        country: country,
        status: status,
        notes: notes,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      showToast(`Đã tạo tài khoản học viên cho ${name} thành công!`, "success");
      
      // 4. Log out secondary instance and delete app context
      await secondaryAuth.signOut();
      await secondaryApp.delete();

      // 5. Reset create user form & reload list
      const createForm = document.getElementById('createStudentUserForm');
      if (createForm) createForm.reset();
      renderStudentUsersList();
    } catch (error) {
      console.error("Error creating student user:", error);
      showToast("Lỗi tạo tài khoản: " + error.message, "error");
      
      // Guarantee clean up on exception
      try {
        await secondaryAuth.signOut();
        await secondaryApp.delete();
      } catch (e) {}
    }
  };

  // Bind Submit Create Student User Form
  const createStudentUserForm = document.getElementById('createStudentUserForm');
  if (createStudentUserForm) {
    createStudentUserForm.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const newName = document.getElementById('newStudentName').value.trim();
      const newCode = document.getElementById('newStudentCode').value.trim().toUpperCase();
      const newEmail = document.getElementById('newStudentEmail').value.trim().toLowerCase();
      const newPhone = document.getElementById('newStudentPhone').value.trim();
      const newCountry = document.getElementById('newStudentCountry').value;
      const newPassword = document.getElementById('newStudentPassword').value;
      const newStatus = document.getElementById('newStudentStatus').value;
      const newNotes = document.getElementById('newStudentNotes').value.trim();

      if (!newName || !newCode || !newEmail || !newPhone || !newPassword) {
        showToast("Vui lòng điền đầy đủ các thông tin bắt buộc!", "error");
        return;
      }

      if (newPassword.length < 6) {
        showToast("Mật khẩu phải tối thiểu 6 ký tự!", "error");
        return;
      }

      handleCreateStudentUser(newEmail, newPassword, newName, newCode, newPhone, newCountry, newStatus, newNotes);
    });
  }

  // Real-time Chat Subscription Handler
  const subscribeToChatMessages = () => {
    if (chatSubscription) chatSubscription(); // Cancel active observer if any
    
    chatSubscription = db.collection("messages")
      .orderBy("createdAt", "asc")
      .limitToLast(100)
      .onSnapshot((snapshot) => {
        const messages = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          let timeStr = "";
          if (data.createdAt) {
            try {
              const date = data.createdAt.toDate();
              timeStr = `${pad(date.getHours(), 2)}:${pad(date.getMinutes(), 2)}`;
            } catch (e) {
              const now = new Date();
              timeStr = `${pad(now.getHours(), 2)}:${pad(now.getMinutes(), 2)}`;
            }
          } else {
            const now = new Date();
            timeStr = `${pad(now.getHours(), 2)}:${pad(now.getMinutes(), 2)}`;
          }

          messages.push({
            sender: `${data.senderName} (${data.senderRole})`,
            content: data.content,
            image: data.image || null,
            time: timeStr
          });
        });

        // Set local thread messages to Firestore real-time snapshot messages
        chatThreads[0].messages = messages;

        // Render Chat views
        renderThreadList();
        const chatDashboard = document.getElementById('chat-dashboard');
        if (chatDashboard && chatDashboard.style.display === 'block') {
          renderMessages(activeThreadId);
        }
      }, (error) => {
        console.error("Real-time messages observer failure:", error);
      });
  };

  // Send message hook (redirected to Firestore messages collection write)
  const handleSendMessage = async () => {
    const input = document.getElementById('chatMessageInput');
    if (!input) return;
    const content = input.value.trim();
    if (!content) return;

    if (!currentUser) {
      showToast("Vui lòng đăng nhập để gửi tin nhắn!", "error");
      return;
    }

    try {
      input.value = ''; // Instantly clear input
      
      const roleLabel = currentUser.role === 'admin' ? 'quản trị viên' : 'nhân viên';
      await db.collection("messages").add({
        content: content,
        senderName: currentUser.name,
        senderRole: roleLabel,
        senderEmail: currentUser.email,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (e) {
      console.error("Error writing message to Firestore:", e);
      showToast("Lỗi gửi tin nhắn!", "error");
    }
  };

  // Rebind the handleSendMessage handler to send message events
  const msgInput = document.getElementById('chatMessageInput');
  const msgSendBtn = document.getElementById('btnSendChatMessage');

  if (msgInput) {
    msgInput.replaceWith(msgInput.cloneNode(true)); // Strip existing listeners
    const newMsgInput = document.getElementById('chatMessageInput');
    newMsgInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handleSendMessage();
      }
    });
  }

  if (msgSendBtn) {
    msgSendBtn.replaceWith(msgSendBtn.cloneNode(true)); // Strip existing listeners
    const newMsgSendBtn = document.getElementById('btnSendChatMessage');
    newMsgSendBtn.addEventListener('click', handleSendMessage);
  }

  // Image Sending Handler (With Canvas Downscale Compression to stay <1MB)
  const btnTriggerImageUpload = document.getElementById('btnTriggerImageUpload');
  const chatImageFileInput = document.getElementById('chatImageFileInput');

  if (btnTriggerImageUpload && chatImageFileInput) {
    btnTriggerImageUpload.replaceWith(btnTriggerImageUpload.cloneNode(true)); // Clean listeners
    chatImageFileInput.replaceWith(chatImageFileInput.cloneNode(true)); // Clean listeners

    const newBtnTrigger = document.getElementById('btnTriggerImageUpload');
    const newFileInput = document.getElementById('chatImageFileInput');

    newBtnTrigger.addEventListener('click', () => {
      newFileInput.click();
    });

    newFileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        showToast("Vui lòng chỉ chọn tệp hình ảnh!", "error");
        return;
      }

      showToast("Đang xử lý và gửi ảnh...", "info");

      const reader = new FileReader();
      reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
          // Downscale using HTML5 canvas to keep size small (<100KB is best for Firestore Base64)
          const maxDim = 400; // max width/height
          let width = img.width;
          let height = img.height;

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          // Compress to JPEG with 0.6 quality
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6);

          // Send as message to Firestore
          sendImageMessage(compressedBase64);
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);

      // Reset input
      newFileInput.value = '';
    });
  }

  const sendImageMessage = async (base64Data) => {
    if (!currentUser) {
      showToast("Vui lòng đăng nhập để gửi tin nhắn!", "error");
      return;
    }

    try {
      const roleLabel = currentUser.role === 'admin' ? 'quản trị viên' : 'nhân viên';
      await db.collection("messages").add({
        content: "",
        image: base64Data,
        senderName: currentUser.name,
        senderRole: roleLabel,
        senderEmail: currentUser.email,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (e) {
      console.error("Failed to write image message:", e);
      showToast("Lỗi gửi hình ảnh!", "error");
    }
  };

  /* ==========================================================================
     STUDENT MANAGEMENT MODULE (INTEGRATED WITH FIREBASE FIRESTORE)
     ========================================================================== */
  
  let students = [];
  let studentsSubscription = null;

  // Default Student Profiles to pre-populate Firestore if empty
  const defaultStudents = [
    {
      code: "TE-2026-001",
      name: "Nguyễn Thảo Chi",
      email: "chi.nguyen@gmail.com",
      phone: "0912345678",
      country: "Nhật",
      status: "Đang học",
      notes: "Học sinh xuất sắc, đang chuẩn bị hồ sơ visa du học Nhật Bản ngành Công nghệ thông tin."
    },
    {
      code: "TE-2026-002",
      name: "Trần Minh Hoàng",
      email: "hoang.tran@outlook.com",
      phone: "0987654321",
      country: "Hàn",
      status: "Chờ phỏng vấn",
      notes: "Đã có thư mời nhập học của trường Đại học Quốc gia Seoul (SNU). Đang luyện phỏng vấn visa Hàn Quốc."
    },
    {
      code: "TE-2026-003",
      name: "Phạm Lê Quỳnh Anh",
      email: "anh.pham@gmail.com",
      phone: "0905558888",
      country: "Đài",
      status: "Đã trúng tuyển",
      notes: "Trúng tuyển Đại học Quốc gia Đài Loan (NTU) với học bổng 20%. Chuẩn bị lên đường vào tháng 9."
    },
    {
      code: "TE-2026-004",
      name: "Vũ Đức Huy",
      email: "huy.vu@domain.com",
      phone: "0944112233",
      country: "Nhật",
      status: "Đang làm hồ sơ",
      notes: "Đang học tiếng Nhật trình độ N3. Đang thẩm định hồ sơ COE Nhật Bản."
    },
    {
      code: "TE-2026-005",
      name: "Lê Thị Mai Chi",
      email: "chi.le@gmail.com",
      phone: "0933778899",
      country: "Hàn",
      status: "Đang học",
      notes: "Đang làm hồ sơ xin visa Hàn Quốc. Học sinh đạt TOPIK 4."
    },
    {
      code: "TE-2026-006",
      name: "Nguyễn Hoàng Nam",
      email: "nam.nguyen@gmail.com",
      phone: "0901234567",
      country: "Đài",
      status: "Đang học",
      notes: "Đang học khóa tiếng Trung TOCFL nâng cao để chuẩn bị nộp hồ sơ Đại học Sư phạm Đài Loan."
    },
    {
      code: "TE-2026-007",
      name: "Phạm Minh Thư",
      email: "thu.pham@outlook.com",
      phone: "0918889999",
      country: "Nhật",
      status: "Đang làm hồ sơ",
      notes: "Hồ sơ Visa đang được thẩm định. Đã hoàn thành đóng học phí kỳ I trường Nhật ngữ tại Tokyo."
    },
    {
      code: "TE-2026-008",
      name: "Lê Khánh Linh",
      email: "linh.le@gmail.com",
      phone: "0934567890",
      country: "Hàn",
      status: "Chờ phỏng vấn",
      notes: "Đã có lịch phỏng vấn học bổng với đại diện tuyển sinh trường Đại học Yonsei."
    },
    {
      code: "TE-2026-009",
      name: "Trần Anh Tuấn",
      email: "tuan.tran@gmail.com",
      phone: "0989998888",
      country: "Đài",
      status: "Đang học",
      notes: "Học sinh đang học tiếng Trung TOCFL tại trung tâm ngoại ngữ ThinkEdu."
    },
    {
      code: "TE-2026-010",
      name: "Vũ Thùy Chi",
      email: "chi.vu@gmail.com",
      phone: "0966667777",
      country: "Nhật",
      status: "Đã trúng tuyển",
      notes: "Nhận học bổng 50% học phí chương trình thạc sĩ của Đại học Waseda."
    },
    {
      code: "TE-2026-011",
      name: "Phan Hoàng Long",
      email: "long.phan@gmail.com",
      phone: "0977778888",
      country: "Hàn",
      status: "Đang làm hồ sơ",
      notes: "Đang đợi kết quả thẩm định hồ sơ tài chính từ Đại học Korea (Korea University)."
    },
    {
      code: "TE-2026-012",
      name: "Đỗ Mai Phương",
      email: "phuong.do@gmail.com",
      phone: "0922223333",
      country: "Đài",
      status: "Đang học",
      notes: "Học sinh đang theo học chương trình tiếng Trung dự bị tại Đài Bắc."
    },
    {
      code: "TE-2026-013",
      name: "Hoàng Quốc Bảo",
      email: "bao.hoang@gmail.com",
      phone: "0933334444",
      country: "Nhật",
      status: "Đang học",
      notes: "Học sinh xuất sắc đạt chứng chỉ tiếng Nhật N2, chuẩn bị nộp hồ sơ visa du học."
    },
    {
      code: "TE-2026-014",
      name: "Bùi Yến Nhi",
      email: "nhi.bui@gmail.com",
      phone: "0944445555",
      country: "Hàn",
      status: "Chờ phỏng vấn",
      notes: "Đang chuẩn bị hồ sơ phỏng vấn trực tiếp tại Đại sứ quán Hàn Quốc."
    },
    {
      code: "TE-2026-015",
      name: "Đặng Đức Minh",
      email: "minh.dang@gmail.com",
      phone: "0955556666",
      country: "Đài",
      status: "Đang làm hồ sơ",
      notes: "Đang viết bài luận cá nhân xin học bổng trường Đại học Khoa học Kỹ thuật Đài Loan."
    },
    {
      code: "TE-2026-016",
      name: "Ngô Thanh Hằng",
      email: "hang.ngo@gmail.com",
      phone: "0966667777",
      country: "Nhật",
      status: "Đã trúng tuyển",
      notes: "Nhận được tư cách lưu trú COE du học Nhật Bản, chuẩn bị bay vào cuối tháng 8."
    },
    {
      code: "TE-2026-017",
      name: "Dương Gia Huy",
      email: "huy.duong@gmail.com",
      phone: "0977778888",
      country: "Hàn",
      status: "Đang học",
      notes: "Học sinh đang cải thiện điểm số GPA kỳ 2 lớp 11 để nộp hồ sơ du học Hàn Quốc."
    },
    {
      code: "TE-2026-018",
      name: "Lý Hương Giang",
      email: "giang.ly@gmail.com",
      phone: "0988889999",
      country: "Đài",
      status: "Đang làm hồ sơ",
      notes: "Đang chờ dịch thuật công chứng học bạ trung học phổ thông để nộp sang Đài Loan."
    },
    {
      code: "TE-2026-019",
      name: "Đỗ Minh Triết",
      email: "triet.do@gmail.com",
      phone: "0999990000",
      country: "Nhật",
      status: "Đang học",
      notes: "Đã đạt chứng chỉ tiếng Nhật N3, chuẩn bị nộp hồ sơ xin thư mời học."
    },
    {
      code: "TE-2026-020",
      name: "Trịnh Quỳnh Chi",
      email: "chi.trinh@gmail.com",
      phone: "0911112222",
      country: "Hàn",
      status: "Chờ phỏng vấn",
      notes: "Đã nhận được thư mời phỏng vấn học bổng danh giá của Đại học Sogang."
    },
    {
      code: "TE-2026-021",
      name: "Lâm Thế Vinh",
      email: "vinh.lam@gmail.com",
      phone: "0922223333",
      country: "Đài",
      status: "Đang học",
      notes: "Học sinh đang ôn tập để đạt chứng chỉ TOCFL cấp 4."
    },
    {
      code: "TE-2026-022",
      name: "Nguyễn Bích Ngọc",
      email: "ngoc.nguyen@gmail.com",
      phone: "0933334444",
      country: "Nhật",
      status: "Đã trúng tuyển",
      notes: "Trúng tuyển ngành Truyền thông Đại học Nagoya kỳ học mùa xuân."
    },
    {
      code: "TE-2026-023",
      name: "Trần Đình Phong",
      email: "phong.tran@gmail.com",
      phone: "0944445555",
      country: "Hàn",
      status: "Đang làm hồ sơ",
      notes: "Đang làm thủ tục chứng minh tài chính xin visa D-2 du học Hàn Quốc."
    },
    {
      code: "TE-2026-024",
      name: "Phạm Thu Thảo",
      email: "thao.pham@gmail.com",
      phone: "0955556666",
      country: "Đài",
      status: "Đang học",
      notes: "Đang tham gia khóa học tiếng Trung giao tiếp trực tuyến với giáo viên bản xứ."
    },
    {
      code: "TE-2026-025",
      name: "Lê Minh Quân",
      email: "quan.le@gmail.com",
      phone: "0966667777",
      country: "Nhật",
      status: "Đang học",
      notes: "Học sinh lớp 11 đang chuẩn bị hồ sơ du học tự túc tại Nhật Bản."
    },
    {
      code: "TE-2026-026",
      name: "Vũ Bảo Ngọc",
      email: "ngoc.vu@gmail.com",
      phone: "0977778888",
      country: "Hàn",
      status: "Chờ phỏng vấn",
      notes: "Luyện phỏng vấn visa du học Hàn Quốc hàng tuần với cố vấn của ThinkEdu."
    },
    {
      code: "TE-2026-027",
      name: "Phan Hữu Phước",
      email: "phuoc.phan@gmail.com",
      phone: "0988889999",
      country: "Đài",
      status: "Đang làm hồ sơ",
      notes: "Đang chuẩn bị hồ sơ nộp xin thư mời học từ Đại học Giao thông Đài Loan."
    },
    {
      code: "TE-2026-028",
      name: "Hoàng Thanh Trúc",
      email: "truc.hoang@gmail.com",
      phone: "0999990000",
      country: "Nhật",
      status: "Đã trúng tuyển",
      notes: "Nhận VISA du học Nhật Bản thành công, xuất cảnh vào tháng 9."
    },
    {
      code: "TE-2026-029",
      name: "Bùi Tiến Dũng",
      email: "dung.bui@gmail.com",
      phone: "0911112222",
      country: "Hàn",
      status: "Đang học",
      notes: "Học sinh đang theo học lớp tiếng Hàn TOPIK cấp tốc cả ngày."
    },
    {
      code: "TE-2026-030",
      name: "Nguyễn Khánh Huyền",
      email: "huyen.nguyen@gmail.com",
      phone: "0922223333",
      country: "Đài",
      status: "Đang làm hồ sơ",
      notes: "Đang đợi kết quả phản hồi xin thư mời học vô điều kiện từ trường Đại học Tsing Hua Đài Loan."
    },
    {
      code: "TE-2026-031",
      name: "Đặng Quang Hải",
      email: "hai.dang@gmail.com",
      phone: "0933334444",
      country: "Nhật",
      status: "Đang học",
      notes: "Đang hoàn tất bài kiểm tra năng lực tiếng Nhật đầu vào trường THPT nội trú Nhật Bản."
    },
    {
      code: "TE-2026-032",
      name: "Trịnh Mai Anh",
      email: "anh.trinh@gmail.com",
      phone: "0944445555",
      country: "Hàn",
      status: "Chờ phỏng vấn",
      notes: "Lên lịch chuẩn bị phỏng vấn học bổng đầu vào của Đại học Hanyang."
    },
    {
      code: "TE-2026-033",
      name: "Ngô Văn Quyết",
      email: "quyet.ngo@gmail.com",
      phone: "0955556666",
      country: "Đài",
      status: "Đang học",
      notes: "Học sinh tích cực tham gia các dự án nghiên cứu khoa học để làm đẹp hồ sơ du học Đài Loan."
    },
    {
      code: "TE-2026-034",
      name: "Lê Hồng Nhung",
      email: "nhung.le@gmail.com",
      phone: "0966667777",
      country: "Nhật",
      status: "Đã trúng tuyển",
      notes: "Đã nộp thành công học phí kỳ đầu tiên cho trường Nhật ngữ tại Osaka."
    },
    {
      code: "TE-2026-035",
      name: "Phạm Hùng Anh",
      email: "anh.pham.h@gmail.com",
      phone: "0977778888",
      country: "Hàn",
      status: "Đang học",
      notes: "Đang hoàn tất các thủ tục khám sức khỏe lao phổi chuẩn bị xin visa du học Hàn Quốc."
    }
  ];

  // Setup Student Database real-time observer
  let currentPage = 1;
  const itemsPerPage = 8;

  const subscribeToStudents = () => {
    if (studentsSubscription) studentsSubscription();

    studentsSubscription = db.collection("students")
      .orderBy("code", "asc")
      .onSnapshot(async (snapshot) => {
        // Real-time migration: delete old mock students containing other countries
        let hasInvalidCountry = false;
        snapshot.forEach((doc) => {
          const data = doc.data();
          if (data.country && !["Nhật", "Đài", "Hàn"].includes(data.country)) {
            hasInvalidCountry = true;
            db.collection("students").doc(doc.id).delete();
          }
        });
        if (hasInvalidCountry) {
          console.log("Cleaned up old mock student data with non-target countries.");
          return;
        }

        // If empty, auto-populate default student profiles to show a live demo
        if (snapshot.empty) {
          console.log("Pre-populating Firestore students database...");
          for (const s of defaultStudents) {
            s.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection("students").add(s);
          }
          return;
        }

        students = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          data.id = doc.id;
          students.push(data);
        });

        // Migration: Auto-populate 30 more students once if only 5 exist
        if (students.length === 5 && !localStorage.getItem('thinkedu_populated_30_v3')) {
          console.log("Auto-populating 30 more students into Firestore...");
          localStorage.setItem('thinkedu_populated_30_v3', 'true');
          const extraStudents = defaultStudents.slice(5);
          for (const s of extraStudents) {
            s.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection("students").add(s);
          }
          showToast("Đang tự động khởi tạo thêm 30 hồ sơ học viên mẫu...", "info");
          return;
        }

        // Trigger render
        applyStudentFiltersAndRender();
      }, (error) => {
        console.error("Firestore students observer failure:", error);
      });
  };

  // Render Student Table Rows
  const renderStudentsTable = (filteredList) => {
    const tableBody = document.getElementById("studentTableBody");
    if (!tableBody) return;
    tableBody.innerHTML = "";

    if (filteredList.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center; padding: 3rem; color:var(--text-muted); font-size:0.85rem;">
            Không tìm thấy hồ sơ học viên nào phù hợp.
          </td>
        </tr>
      `;
      return;
    }

    filteredList.forEach((student) => {
      const tr = document.createElement("tr");
      
      // Determine badge color class based on status
      let badgeClass = "badge-danghoc";
      if (student.status === "Chờ phỏng vấn") badgeClass = "badge-waiting";
      else if (student.status === "Đã trúng tuyển") badgeClass = "badge-selected";
      else if (student.status === "Đang làm hồ sơ") badgeClass = "badge-processing";

      tr.innerHTML = `
        <td style="text-align: center;"><span class="font-mono" style="font-weight:600; color:var(--accent);">${student.code}</span></td>
        <td style="text-align: center;"><strong>${student.name}</strong></td>
        <td style="text-align: center;">
          <span style="font-size:0.8rem; display:block; text-align: center;">${student.email}</span>
          <span style="font-size:0.75rem; color:var(--text-muted); display:block; text-align: center;">${student.phone}</span>
        </td>
        <td style="text-align: center;"><strong>${student.country}</strong></td>
        <td style="text-align: center;"><span class="crm-badge ${badgeClass}">${student.status}</span></td>
        <td style="text-align: center;">
          <div style="display: flex; gap: 0.5rem; justify-content: center; align-items: center;">
            <button class="action-icon-btn btn-view-student" data-id="${student.id}" title="Chi tiết" style="padding: 6px; color: var(--accent); background:none; border:none; cursor:pointer;">
              <svg viewBox="0 0 24 24" style="width:18px; height:18px; fill:currentColor;"><path d="M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,4.5C7,4.5 2.73,7.61 1,12C2.73,16.39 7,19.5 12,19.5C17,19.5 21.27,16.39 23,12C21.27,7.61 17,4.5 12,4.5Z"/></svg>
            </button>
            <button class="action-icon-btn btn-edit-student" data-id="${student.id}" title="Sửa" style="padding: 6px; color: var(--text-main); background:none; border:none; cursor:pointer;">
              <svg viewBox="0 0 24 24" style="width:18px; height:18px; fill:currentColor;"><path d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.07,6.18L3,17.25Z"/></svg>
            </button>
            <button class="action-icon-btn btn-delete-student" data-id="${student.id}" title="Xóa" style="padding: 6px; color: #EF4444; background:none; border:none; cursor:pointer;">
              <svg viewBox="0 0 24 24" style="width:18px; height:18px; fill:currentColor;"><path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/></svg>
            </button>
          </div>
        </td>
      `;

      // Bind Action Listeners inside row
      tr.querySelector(".btn-view-student").addEventListener("click", () => openStudentDetailModal(student));
      tr.querySelector(".btn-edit-student").addEventListener("click", () => openEditStudentModal(student));
      tr.querySelector(".btn-delete-student").addEventListener("click", () => handleDeleteStudent(student));

      tableBody.appendChild(tr);
    });
  };

  // Apply Search & Dropdown Filters
  const applyStudentFiltersAndRender = () => {
    const searchInputEl = document.getElementById("studentSearchInput");
    const countryFilterEl = document.getElementById("studentCountryFilter");
    const statusFilterEl = document.getElementById("studentStatusFilter");
    
    const searchVal = searchInputEl ? searchInputEl.value.trim().toLowerCase() : "";
    const countryVal = countryFilterEl ? countryFilterEl.value : "All";
    const statusVal = statusFilterEl ? statusFilterEl.value : "All";

    const filtered = students.filter((student) => {
      const textMatch = !searchVal || 
        (student.name && student.name.toLowerCase().includes(searchVal)) ||
        (student.email && student.email.toLowerCase().includes(searchVal)) ||
        (student.phone && student.phone.includes(searchVal)) ||
        (student.code && student.code.toLowerCase().includes(searchVal));

      const countryMatch = countryVal === "All" || student.country === countryVal;
      const statusMatch = statusVal === "All" || student.status === statusVal;

      return textMatch && countryMatch && statusMatch;
    });

    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

    // Boundary corrections
    if (currentPage > totalPages) {
      currentPage = totalPages;
    }
    if (currentPage < 1) {
      currentPage = 1;
    }

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, totalItems);

    const pageItems = filtered.slice(startIndex, endIndex);

    renderStudentsTable(pageItems);

    // Update Pagination UI Labels
    const paginatedStart = document.getElementById("paginatedStart");
    const paginatedEnd = document.getElementById("paginatedEnd");
    const paginatedTotal = document.getElementById("paginatedTotal");
    const currentPageLabel = document.getElementById("currentPageLabel");

    if (paginatedStart) paginatedStart.textContent = totalItems === 0 ? 0 : startIndex + 1;
    if (paginatedEnd) paginatedEnd.textContent = endIndex;
    if (paginatedTotal) paginatedTotal.textContent = totalItems;
    if (currentPageLabel) currentPageLabel.textContent = `Trang ${currentPage} / ${totalPages}`;

    // Enable/Disable buttons
    const btnPrev = document.getElementById("btnPrevPage");
    const btnNext = document.getElementById("btnNextPage");
    if (btnPrev) btnPrev.disabled = (currentPage === 1);
    if (btnNext) btnNext.disabled = (currentPage === totalPages);
  };

  // Reset page and trigger filter
  const resetPageAndFilter = () => {
    currentPage = 1;
    applyStudentFiltersAndRender();
  };

  // Bind Filters Change Events
  const bindFilters = () => {
    const sInput = document.getElementById("studentSearchInput");
    const cFilter = document.getElementById("studentCountryFilter");
    const stFilter = document.getElementById("studentStatusFilter");

    if (sInput) sInput.addEventListener("input", resetPageAndFilter);
    if (cFilter) cFilter.addEventListener("change", resetPageAndFilter);
    if (stFilter) stFilter.addEventListener("change", resetPageAndFilter);

    // Bind Pagination Clicks
    const btnPrev = document.getElementById("btnPrevPage");
    const btnNext = document.getElementById("btnNextPage");

    if (btnPrev) {
      btnPrev.replaceWith(btnPrev.cloneNode(true));
      const newBtnPrev = document.getElementById("btnPrevPage");
      newBtnPrev.addEventListener("click", () => {
        if (currentPage > 1) {
          currentPage--;
          applyStudentFiltersAndRender();
        }
      });
    }

    if (btnNext) {
      btnNext.replaceWith(btnNext.cloneNode(true));
      const newBtnNext = document.getElementById("btnNextPage");
      newBtnNext.addEventListener("click", () => {
        // Calculate dynamic filtered count
        const searchInputEl = document.getElementById("studentSearchInput");
        const countryFilterEl = document.getElementById("studentCountryFilter");
        const statusFilterEl = document.getElementById("studentStatusFilter");
        
        const searchVal = searchInputEl ? searchInputEl.value.trim().toLowerCase() : "";
        const countryVal = countryFilterEl ? countryFilterEl.value : "All";
        const statusVal = statusFilterEl ? statusFilterEl.value : "All";

        const filteredCount = students.filter((student) => {
          const textMatch = !searchVal || 
            (student.name && student.name.toLowerCase().includes(searchVal)) ||
            (student.email && student.email.toLowerCase().includes(searchVal)) ||
            (student.phone && student.phone.includes(searchVal)) ||
            (student.code && student.code.toLowerCase().includes(searchVal));
          const countryMatch = countryVal === "All" || student.country === countryVal;
          const statusMatch = statusVal === "All" || student.status === statusVal;
          return textMatch && countryMatch && statusMatch;
        }).length;

        const maxPages = Math.ceil(filteredCount / itemsPerPage) || 1;
        if (currentPage < maxPages) {
          currentPage++;
          applyStudentFiltersAndRender();
        }
      });
    }
  };

  // Modals Logic
  const studentModal = document.getElementById("studentModal");
  const studentDetailModal = document.getElementById("studentDetailModal");
  const studentForm = document.getElementById("studentForm");
  const btnOpenAddStudentModal = document.getElementById("btnOpenAddStudentModal");

  // Open modal for Adding new student
  if (btnOpenAddStudentModal && studentModal) {
    btnOpenAddStudentModal.addEventListener("click", () => {
      document.getElementById("studentModalTitle").textContent = "+ THÊM HỌC VIÊN MỚI";
      document.getElementById("studentEditId").value = "";
      studentForm.reset();
      studentModal.style.display = "flex";
    });
  }

  // Close Modals Hooks
  const closeStudentModal = () => { if (studentModal) studentModal.style.display = "none"; };
  const closeStudentDetailModal = () => { if (studentDetailModal) studentDetailModal.style.display = "none"; };

  const btnCloseStudentModal = document.getElementById("btnCloseStudentModal");
  if (btnCloseStudentModal) btnCloseStudentModal.addEventListener("click", closeStudentModal);

  const btnCloseStudentDetailModal = document.getElementById("btnCloseStudentDetailModal");
  if (btnCloseStudentDetailModal) btnCloseStudentDetailModal.addEventListener("click", closeStudentDetailModal);

  const btnCloseDetailModalAction = document.getElementById("btnCloseDetailModalAction");
  if (btnCloseDetailModalAction) btnCloseDetailModalAction.addEventListener("click", closeStudentDetailModal);

  // Close on backdrop click
  if (studentModal) {
    studentModal.addEventListener("click", (e) => {
      if (e.target === studentModal) closeStudentModal();
    });
  }
  if (studentDetailModal) {
    studentDetailModal.addEventListener("click", (e) => {
      if (e.target === studentDetailModal) closeStudentDetailModal();
    });
  }

  // Open View Details Modal
  const openStudentDetailModal = (student) => {
    if (!studentDetailModal) return;

    const displayAvatarInitials = student.name.split(" ").map(n => n[0]).join("").substring(0,2).toUpperCase();
    document.getElementById("detailStudentAvatar").textContent = displayAvatarInitials;
    document.getElementById("detailStudentAvatar").style.backgroundColor = getAvatarBgColor(student.name);
    document.getElementById("detailStudentName").textContent = student.name;
    document.getElementById("detailStudentCode").textContent = student.code;
    document.getElementById("detailStudentEmail").textContent = student.email;
    document.getElementById("detailStudentPhone").textContent = student.phone;
    document.getElementById("detailStudentCountry").textContent = student.country;

    // Badge styling
    const badge = document.getElementById("detailStudentStatus");
    badge.textContent = student.status;
    badge.className = "crm-badge";
    let badgeClass = "badge-danghoc";
    if (student.status === "Chờ phỏng vấn") badgeClass = "badge-waiting";
    else if (student.status === "Đã trúng tuyển") badgeClass = "badge-selected";
    else if (student.status === "Đang làm hồ sơ") badgeClass = "badge-processing";
    badge.classList.add(badgeClass);

    document.getElementById("detailStudentNotes").textContent = student.notes || "Chưa có ghi chú nào.";

    // Bind Edit button inside View details modal
    const btnEdit = document.getElementById("btnEditDetailStudent");
    if (btnEdit) {
      // Re-create node to discard old event listeners safely
      btnEdit.replaceWith(btnEdit.cloneNode(true));
      const newBtnEdit = document.getElementById("btnEditDetailStudent");
      newBtnEdit.addEventListener("click", () => {
        closeStudentDetailModal();
        openEditStudentModal(student);
      });
    }

    studentDetailModal.style.display = "flex";
  };

  // Open Edit Form Modal
  const openEditStudentModal = (student) => {
    if (!studentModal) return;
    document.getElementById("studentModalTitle").textContent = "CHỈNH SỬA HỒ SƠ HỌC VIÊN";
    document.getElementById("studentEditId").value = student.id;
    document.getElementById("studentName").value = student.name;
    document.getElementById("studentCode").value = student.code;
    document.getElementById("studentEmail").value = student.email;
    document.getElementById("studentPhone").value = student.phone;
    document.getElementById("studentCountry").value = student.country;
    document.getElementById("studentStatus").value = student.status;
    document.getElementById("studentNotes").value = student.notes || "";

    studentModal.style.display = "flex";
  };

  // Delete Student Profile
  const handleDeleteStudent = async (student) => {
    if (confirm(`Bạn có chắc chắn muốn xóa hồ sơ học viên ${student.name} (${student.code})?`)) {
      try {
        await db.collection("students").doc(student.id).delete();
        showToast(`Đã xóa hồ sơ học viên ${student.name} thành công!`, "warning");
      } catch (err) {
        console.error("Delete student failure:", err);
        showToast("Lỗi khi xóa hồ sơ học viên!", "error");
      }
    }
  };

  // Save Student (Add or Update) Form Submit Handler
  if (studentForm) {
    studentForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const editId = document.getElementById("studentEditId").value;
      const name = document.getElementById("studentName").value.trim();
      const code = document.getElementById("studentCode").value.trim().toUpperCase();
      const email = document.getElementById("studentEmail").value.trim();
      const phone = document.getElementById("studentPhone").value.trim();
      const country = document.getElementById("studentCountry").value;
      const status = document.getElementById("studentStatus").value;
      const notes = document.getElementById("studentNotes").value.trim();

      if (!name || !code || !email || !phone) {
        showToast("Vui lòng nhập đầy đủ các trường thông tin có dấu *!", "error");
        return;
      }

      const payload = {
        name,
        code,
        email,
        phone,
        country,
        status,
        notes,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      try {
        if (editId) {
          // Update
          await db.collection("students").doc(editId).update(payload);
          showToast(`Đã cập nhật hồ sơ học viên ${name} thành công!`, "success");
        } else {
          // Add
          payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
          await db.collection("students").add(payload);
          showToast(`Đã thêm mới hồ sơ học viên ${name} thành công!`, "success");
        }
        closeStudentModal();
      } catch (err) {
        console.error("Save student failure:", err);
        showToast("Lỗi hệ thống khi lưu thông tin học viên!", "error");
      }
    });
  }

  // Bind change events initially
  bindFilters();

  // Excel CSV Exporter Handler
  const handleExportExcel = () => {
    if (students.length === 0) {
      showToast("Không có dữ liệu học viên để xuất!", "warning");
      return;
    }

    const searchInputEl = document.getElementById("studentSearchInput");
    const countryFilterEl = document.getElementById("studentCountryFilter");
    const statusFilterEl = document.getElementById("studentStatusFilter");
    
    const searchVal = searchInputEl ? searchInputEl.value.trim().toLowerCase() : "";
    const countryVal = countryFilterEl ? countryFilterEl.value : "All";
    const statusVal = statusFilterEl ? statusFilterEl.value : "All";

    const filtered = students.filter((student) => {
      const textMatch = !searchVal || 
        (student.name && student.name.toLowerCase().includes(searchVal)) ||
        (student.email && student.email.toLowerCase().includes(searchVal)) ||
        (student.phone && student.phone.includes(searchVal)) ||
        (student.code && student.code.toLowerCase().includes(searchVal));

      const countryMatch = countryVal === "All" || student.country === countryVal;
      const statusMatch = statusVal === "All" || student.status === statusVal;

      return textMatch && countryMatch && statusMatch;
    });

    if (filtered.length === 0) {
      showToast("Không có bản ghi nào phù hợp với bộ lọc hiện tại để xuất!", "warning");
      return;
    }

    // CSV Generation with UTF-8 BOM
    let csvContent = "MÃ HỌC VIÊN,HỌ VÀ TÊN,EMAIL,SỐ ĐIỆN THOẠI,QUỐC GIA ĐẾN,TRẠNG THÁI HỒ SƠ,GHI CHÚ\n";

    filtered.forEach((s) => {
      const notesClean = (s.notes || "").replace(/"/g, '""').replace(/\n/g, ' ');
      csvContent += `"${s.code}","${s.name}","${s.email}","${s.phone}","${s.country}","${s.status}","${notesClean}"\n`;
    });

    // Create download anchor with UTF-8 BOM (0xEF, 0xBB, 0xBF)
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Danh_Sach_Hoc_Vien_ThinkEdu_${new Date().toLocaleDateString('vi-VN').replace(/\//g, '-')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast(`Đã xuất thành công ${filtered.length} hồ sơ học viên ra Excel CSV!`, "success");
  };

  const btnExportExcel = document.getElementById("btnExportExcel");
  if (btnExportExcel) {
    btnExportExcel.addEventListener("click", handleExportExcel);
  }

  // Profile Update Variables
  let selectedProfileAvatarBase64 = null;

  // Bind Open Profile Modal click
  const btnOpenProfileModal = document.getElementById('btnOpenProfileModal');
  const profileModal = document.getElementById('profileModal');
  const btnCloseProfileModal = document.getElementById('btnCloseProfileModal');
  const profileForm = document.getElementById('profileForm');
  const profileAvatarPreview = document.getElementById('profileAvatarPreview');
  const btnTriggerAvatarUpload = document.getElementById('btnTriggerAvatarUpload');
  const profileAvatarFileInput = document.getElementById('profileAvatarFileInput');
  const profileFullNameInput = document.getElementById('profileFullName');

  const openProfileModalFn = () => {
    if (!currentUser) {
      showToast("Vui lòng đăng nhập để thực hiện!", "error");
      return;
    }

    profileFullNameInput.value = currentUser.name || "";
    selectedProfileAvatarBase64 = currentUser.avatar || null;

    // Update avatar preview modal
    if (selectedProfileAvatarBase64) {
      profileAvatarPreview.innerHTML = `<img src="${selectedProfileAvatarBase64}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
      profileAvatarPreview.style.backgroundColor = "transparent";
    } else {
      const initials = currentUser.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
      profileAvatarPreview.textContent = initials;
      profileAvatarPreview.style.backgroundColor = getAvatarBgColor(currentUser.name);
    }

    profileModal.style.display = 'flex';
  };

  document.querySelectorAll('#btnOpenProfileModal, .btn-open-profile-from-topbar').forEach(btn => {
    btn.addEventListener('click', openProfileModalFn);
  });

  // Close Profile Modal hooks
  const closeProfileModal = () => { if (profileModal) profileModal.style.display = 'none'; };
  if (btnCloseProfileModal) btnCloseProfileModal.addEventListener('click', closeProfileModal);
  if (profileModal) {
    profileModal.addEventListener('click', (e) => {
      if (e.target === profileModal) closeProfileModal();
    });
  }

  // Trigger avatar file input clicks
  const triggerAvatarClick = () => { if (profileAvatarFileInput) profileAvatarFileInput.click(); };
  if (btnTriggerAvatarUpload) btnTriggerAvatarUpload.addEventListener('click', triggerAvatarClick);
  if (profileAvatarPreview) profileAvatarPreview.addEventListener('click', triggerAvatarClick);

  // Handle avatar file selection and Canvas compression
  if (profileAvatarFileInput) {
    profileAvatarFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        showToast("Vui lòng chỉ chọn tệp hình ảnh làm đại diện!", "error");
        return;
      }

      const reader = new FileReader();
      reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
          // Downscale to exactly 80x80 pixels for ultra-light Base64 footprint
          const dim = 80;
          const canvas = document.createElement('canvas');
          canvas.width = dim;
          canvas.height = dim;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, dim, dim);

          // Compress to JPEG with 0.8 quality
          const compressedAvatar = canvas.toDataURL('image/jpeg', 0.8);
          selectedProfileAvatarBase64 = compressedAvatar;

          // Render preview
          profileAvatarPreview.textContent = "";
          profileAvatarPreview.innerHTML = `<img src="${compressedAvatar}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
          profileAvatarPreview.style.backgroundColor = "transparent";
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // Submit Profile Form and update in Firestore
  if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const newName = profileFullNameInput.value.trim();
      if (!newName) {
        showToast("Vui lòng điền đầy đủ họ và tên của bạn!", "error");
        return;
      }

      showToast("Đang cập nhật hồ sơ cá nhân...", "info");

      try {
        const uid = auth.currentUser.uid;
        const updates = {
          name: newName,
          avatar: selectedProfileAvatarBase64 || null,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        // Write changes to Firestore user document
        await db.collection("users").doc(uid).update(updates);

        // Update local currentUser state instantly
        currentUser.name = newName;
        currentUser.avatar = selectedProfileAvatarBase64 || null;

        // Force reload / re-sync UI details
        syncUserInfoUI(currentUser);
        closeProfileModal();
        showToast("Hồ sơ cá nhân của bạn đã được cập nhật thành công!", "success");
      } catch (err) {
        console.error("Failed to update user profile:", err);
        showToast("Lỗi cập nhật hồ sơ cá nhân!", "error");
      }
    });
  }

  // Bind dropdown logout click
  document.querySelectorAll('.btn-logout-app-portal').forEach(btn => {
    btn.addEventListener('click', handlePortalLogout);
  });

  // Startup and Reload Session Handler
  const checkPortalSession = () => {
    // 2. Setup Auth state changed listener
    auth.onAuthStateChanged(async (user) => {
      if (user) {
        try {
          const doc = await db.collection("users").doc(user.uid).get();
          if (doc.exists) {
            currentUser = doc.data();
          } else {
            // Fallback default admin profile in case of delay
            currentUser = {
              name: "Admin ThinkEdu",
              email: user.email,
              role: user.email === 'admin@domain.com' ? 'admin' : 'staff'
            };
          }

          // Sync credentials to UI headers
          syncUserInfoUI(currentUser);

          if (currentUser.role === 'student') {
            // SHOW Student App Root, hide Login Panel and Admin Portal
            if (loginContainer) loginContainer.style.display = 'none';
            if (appRoot) appRoot.style.display = 'none';
            
            const studentAppRoot = document.getElementById('student-app-root');
            if (studentAppRoot) studentAppRoot.style.display = 'flex';

            // Query dynamic profile details from Firestore
            try {
              const profileQuery = await db.collection("students").where("email", "==", user.email).get();
              let profileData = {
                name: currentUser.name,
                code: "TE-2026-999",
                phone: "Chưa rõ",
                country: "Nhật",
                status: "Đang học",
                notes: ""
              };
              
              profileQuery.forEach(pDoc => {
                profileData = pDoc.data();
              });

              // Populate Dynamic UI Elements in Student Portal
              const studentNameDisplay = document.getElementById('studentNameDisplay');
              const studentCodeDisplay = document.getElementById('studentCodeDisplay');
              const studentAvatar = document.getElementById('studentAvatar');
              
              if (studentNameDisplay) studentNameDisplay.textContent = profileData.name;
              if (studentCodeDisplay) studentCodeDisplay.textContent = profileData.code;
              
              if (studentAvatar) {
                const initials = profileData.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
                studentAvatar.textContent = initials;
                studentAvatar.style.backgroundColor = getAvatarBgColor(profileData.name);
              }

              // Update Timeline Milestones based on country & status
              const milestoneSteps = document.querySelectorAll('.milestone-timeline .milestone-step');
              milestoneSteps.forEach(step => {
                step.style.opacity = '0.7';
                const dot = step.querySelector('.milestone-dot');
                if (dot) {
                  dot.className = 'milestone-dot';
                  dot.style.background = 'var(--border)';
                  dot.style.border = '4px solid var(--bg-card)';
                }
                const badge = step.querySelector('.status-badge');
                if (badge) {
                  badge.textContent = 'CHƯA BẮT ĐẦU';
                  badge.className = 'status-badge';
                  badge.style.background = 'transparent';
                  badge.style.border = '1px solid var(--border)';
                  badge.style.color = 'var(--text-muted)';
                }
              });

              // Map status to milestones
              let activeStepIndex = 1; // Default
              if (profileData.status === "Đang học") {
                activeStepIndex = 2;
              } else if (profileData.status === "Đang làm hồ sơ") {
                activeStepIndex = 3;
              } else if (profileData.status === "Chờ phỏng vấn") {
                activeStepIndex = 4;
              } else if (profileData.status === "Đã trúng tuyển") {
                activeStepIndex = 5;
              }

              for (let i = 1; i <= 5; i++) {
                const step = document.getElementById(`milestone-step-${i}`);
                if (!step) continue;
                
                const dot = step.querySelector('.milestone-dot');
                const badge = step.querySelector('.status-badge');

                if (i < activeStepIndex) {
                  // Completed
                  step.style.opacity = '1';
                  if (dot) {
                    dot.className = 'milestone-dot completed';
                    dot.style.background = 'var(--accent)';
                    dot.style.border = '4px solid var(--accent-light)';
                  }
                  if (badge) {
                    badge.textContent = 'ĐÃ HOÀN THÀNH';
                    badge.style.background = 'var(--accent-light)';
                    badge.style.color = 'var(--accent)';
                    badge.style.border = 'none';
                  }
                } else if (i === activeStepIndex) {
                  // Active
                  step.style.opacity = '1';
                  if (dot) {
                    dot.className = 'milestone-dot active';
                    dot.style.background = '#FAF9F6';
                    dot.style.border = '5px solid var(--accent)';
                  }
                  if (badge) {
                    badge.textContent = 'ĐANG THỰC HIỆN';
                    badge.style.background = 'var(--border)';
                    badge.style.color = 'var(--text-main)';
                    badge.style.border = 'none';
                  }
                }
              }

              // Update Tuition Info dynamically
              const syntaxDisplay = document.getElementById('transferSyntaxDisplay');
              if (syntaxDisplay) {
                syntaxDisplay.textContent = `Nop hoc phi - ${profileData.code} - ${profileData.name.toUpperCase()}`;
              }

              const remainingDisplay = document.getElementById('remainingBalanceDisplay');
              if (remainingDisplay) {
                // Adjust remaining based on status
                if (profileData.status === "Đã trúng tuyển") {
                  remainingDisplay.textContent = "0 ₫";
                } else {
                  remainingDisplay.textContent = "75,000,000 ₫";
                }
              }

            } catch (err) {
              console.error("Error loading student profile details:", err);
            }

            // Setup Student Tab Swapping micro-interactions
            const studentNavItems = document.querySelectorAll('.student-nav-item');
            const studentTabContents = document.querySelectorAll('.student-tab-content');

            studentNavItems.forEach(item => {
              item.replaceWith(item.cloneNode(true)); // Strip old listeners
            });

            // Re-query new tab buttons after cloning
            const newNavItems = document.querySelectorAll('.student-nav-item');
            newNavItems.forEach(btn => {
              btn.addEventListener('click', () => {
                const targetTab = btn.getAttribute('data-tab');

                // Toggle Active Navigation Link styles
                newNavItems.forEach(i => {
                  i.classList.remove('active');
                  i.style.color = 'var(--text-muted)';
                  i.style.fontWeight = '500';
                  i.style.borderBottomColor = 'transparent';
                });
                btn.classList.add('active');
                btn.style.color = 'var(--text-main)';
                btn.style.fontWeight = '600';
                btn.style.borderBottomColor = 'var(--accent)';

                // Toggle Tab Content displays
                studentTabContents.forEach(tab => {
                  tab.classList.remove('active');
                  tab.style.display = 'none';
                });
                
                const activeTab = document.getElementById(targetTab);
                if (activeTab) {
                  activeTab.style.display = 'block';
                  // Force reflow and add reveal active class for slide-in animation
                  activeTab.offsetHeight;
                  activeTab.classList.add('active');
                }
              });
            });

            // Bind Student Logout button
            const btnStudentLogout = document.getElementById('btnStudentLogout');
            if (btnStudentLogout) {
              btnStudentLogout.replaceWith(btnStudentLogout.cloneNode(true));
              const newBtnStudentLogout = document.getElementById('btnStudentLogout');
              newBtnStudentLogout.addEventListener('click', handlePortalLogout);
            }

            // Default to Tab 1 (Bảng Tin)
            const newsTabBtn = document.querySelector('[data-tab="student-news-tab"]');
            if (newsTabBtn) newsTabBtn.click();

          } else {
            // SHOW Main App Root, hide Student Portal and Login Panel
            const studentAppRoot = document.getElementById('student-app-root');
            if (studentAppRoot) studentAppRoot.style.display = 'none';
            if (loginContainer) loginContainer.style.display = 'none';
            if (appRoot) appRoot.style.display = 'flex';

            // Subscribe to real-time chat updates
            subscribeToChatMessages();

            // Subscribe to real-time students updates
            subscribeToStudents();

            // Navigate to Chat group dashboard by default
            switchPortalView('chat-dashboard');
          }
        } catch (e) {
          console.error("Error setting up logged in user session:", e);
          showToast("Lỗi đồng bộ dữ liệu người dùng!", "error");
        }
      } else {
        currentUser = null;
        if (chatSubscription) {
          chatSubscription();
          chatSubscription = null;
        }
        if (studentsSubscription) {
          studentsSubscription();
          studentsSubscription = null;
        }

        // Show Login Panel, hide App Workspaces
        const studentAppRoot = document.getElementById('student-app-root');
        if (studentAppRoot) studentAppRoot.style.display = 'none';
        if (loginContainer) loginContainer.style.display = 'flex';
        if (appRoot) appRoot.style.display = 'none';
      }
    });
  };
  checkPortalSession();

});
