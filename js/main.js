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

    // Sidebar Badge
    const sidebarAvatar = document.getElementById('portalUserAvatar');
    const sidebarName = document.getElementById('portalUserName');
    const sidebarRole = document.getElementById('portalUserRole');
    if (sidebarAvatar) sidebarAvatar.textContent = avatarInitials;
    if (sidebarName) sidebarName.textContent = user.name;
    if (sidebarRole) sidebarRole.textContent = displayRole;

    // Mini Chat header
    const miniChatAvatar = document.getElementById('miniChatAvatar');
    const miniChatName = document.getElementById('miniChatName');
    const miniChatRole = document.getElementById('miniChatRole');
    if (miniChatAvatar) miniChatAvatar.textContent = avatarInitials;
    if (miniChatName) miniChatName.textContent = user.name;
    if (miniChatRole) miniChatRole.textContent = displayRole;

    // Mini Users header
    const miniUsersAvatar = document.getElementById('miniUsersAvatar');
    const miniUsersName = document.getElementById('miniUsersName');
    const miniUsersRole = document.getElementById('miniUsersRole');
    if (miniUsersAvatar) miniUsersAvatar.textContent = avatarInitials;
    if (miniUsersName) miniUsersName.textContent = user.name;
    if (miniUsersRole) miniUsersRole.textContent = displayRole;

    // Mini Students header
    const miniStudentsAvatar = document.getElementById('miniStudentsAvatar');
    const miniStudentsName = document.getElementById('miniStudentsName');
    const miniStudentsRole = document.getElementById('miniStudentsRole');
    if (miniStudentsAvatar) miniStudentsAvatar.textContent = avatarInitials;
    if (miniStudentsName) miniStudentsName.textContent = user.name;
    if (miniStudentsRole) miniStudentsRole.textContent = displayRole;

    // Role-based Access Controls (Admin Only "Tạo tài khoản NV")
    const menuItemCreateUsers = document.getElementById('menuItemCreateUsers');
    if (menuItemCreateUsers) {
      if (user.role === 'admin') {
        menuItemCreateUsers.style.display = 'flex';
      } else {
        menuItemCreateUsers.style.display = 'none';
      }
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
          <td><strong>${user.name}</strong><br><span style="font-size:0.7rem; color:var(--text-muted);">Tạo ngày: ${dateString}</span></td>
          <td><span class="font-mono" style="font-weight:500;">${user.email}</span></td>
          <td><span class="font-mono" style="color:var(--text-muted); font-weight:500;">********</span></td>
          <td><span class="crm-badge badge-danghoc">Nhân viên</span></td>
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
      country: "Úc",
      status: "Đang học",
      notes: "Học sinh xuất sắc, đang chuẩn bị hồ sơ visa du học Úc ngành Công nghệ thông tin."
    },
    {
      code: "TE-2026-002",
      name: "Trần Minh Hoàng",
      email: "hoang.tran@outlook.com",
      phone: "0987654321",
      country: "Mỹ",
      status: "Chờ phỏng vấn",
      notes: "Đã có thư mời nhập học của trường Arizona State University. Đang luyện phỏng vấn visa Mỹ."
    },
    {
      code: "TE-2026-003",
      name: "Phạm Lê Quỳnh Anh",
      email: "anh.pham@gmail.com",
      phone: "0905558888",
      country: "Canada",
      status: "Đã trúng tuyển",
      notes: "Trúng tuyển Đại học Toronto với học bổng 20%. Chuẩn bị lên đường vào tháng 9."
    },
    {
      code: "TE-2026-004",
      name: "Vũ Đức Huy",
      email: "huy.vu@domain.com",
      phone: "0944112233",
      country: "Đức",
      status: "Đang làm hồ sơ",
      notes: "Đang học tiếng Đức trình độ B2. Đang thẩm định hồ sơ APS."
    },
    {
      code: "TE-2026-005",
      name: "Lê Thị Mai Chi",
      email: "chi.le@gmail.com",
      phone: "0933778899",
      country: "Anh",
      status: "Đang học",
      notes: "Đang làm hồ sơ xin visa Anh. Học sinh đạt IELTS 7.5."
    }
  ];

  // Setup Student Database real-time observer
  const subscribeToStudents = () => {
    if (studentsSubscription) studentsSubscription();

    studentsSubscription = db.collection("students")
      .orderBy("code", "asc")
      .onSnapshot(async (snapshot) => {
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
        <td><span class="font-mono" style="font-weight:600; color:var(--accent);">${student.code}</span></td>
        <td><strong>${student.name}</strong></td>
        <td>
          <span style="font-size:0.8rem; display:block;">${student.email}</span>
          <span style="font-size:0.75rem; color:var(--text-muted);">${student.phone}</span>
        </td>
        <td><strong>${student.country}</strong></td>
        <td><span class="crm-badge ${badgeClass}">${student.status}</span></td>
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

    renderStudentsTable(filtered);
  };

  // Bind Filters Change Events
  const bindFilters = () => {
    const sInput = document.getElementById("studentSearchInput");
    const cFilter = document.getElementById("studentCountryFilter");
    const stFilter = document.getElementById("studentStatusFilter");

    if (sInput) sInput.addEventListener("input", applyStudentFiltersAndRender);
    if (cFilter) cFilter.addEventListener("change", applyStudentFiltersAndRender);
    if (stFilter) stFilter.addEventListener("change", applyStudentFiltersAndRender);
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

  // Startup and Reload Session Handler (Force signOut upon load/refresh)
  const checkPortalSession = () => {
    // 1. Force log out on reload/startup to respect the "reload triggers logout" requirement
    auth.signOut();

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

          // Show Main App Root, hide Login Panel
          if (loginContainer) loginContainer.style.display = 'none';
          if (appRoot) appRoot.style.display = 'flex';

          // Subscribe to real-time chat updates
          subscribeToChatMessages();

          // Subscribe to real-time students updates
          subscribeToStudents();

          // Navigate to Chat group dashboard by default
          switchPortalView('chat-dashboard');
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

        // Show Login Panel, hide App Workspace
        if (loginContainer) loginContainer.style.display = 'flex';
        if (appRoot) appRoot.style.display = 'none';
      }
    });
  };
  checkPortalSession();

});
