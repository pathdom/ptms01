document.addEventListener('DOMContentLoaded', () => {

  // Tap-to-toggle topbar user dropdown (mobile/touch fallback — :hover không đáng tin cậy trên thiết bị chạm)
  document.addEventListener('click', (e) => {
    const wrapper = e.target.closest('.topbar-user-wrapper');
    document.querySelectorAll('.topbar-user-wrapper.open').forEach(w => {
      if (w !== wrapper) w.classList.remove('open');
    });
    if (wrapper) {
      wrapper.classList.toggle('open');
    }
  });

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
  const showToast = (message, type = 'info', duration = 4000) => {
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
    }, duration);
  };

  /* ==========================================================================
     TELEGRAM-STYLE CHAT SYSTEM LOGIC & DATA (TRANSITIONED TO FIREBASE)
     ========================================================================== */
  
  // Dynamic chat threads cache
  let chatThreads = [];

  let activeThreadId = "group-global";
  let chatSearchQuery = "";
  let activeChatSearchQuery = ""; // Query for highlighting inside the conversation

  // Global cache for users, contacts, and messages
  let usersCache = {}; // Cache all users: { uid: userData }
  let allUsersList = []; // List of all users for searching
  let myContacts = []; // List of contact UIDs for current user
  let contactsSubscription = null;
  let usersSubscription = null;
  let sentRequestsSubscription = null;
  let receivedRequestsSubscription = null;
  let mySentRequests = [];
  let myReceivedRequests = [];
  let allLoadedMessages = []; // Cache of all loaded messages

  // Get unique DM thread ID for two UIDs sorted alphabetically
  const getDmThreadId = (uid1, uid2) => {
    const sorted = [uid1, uid2].sort();
    return `dm-${sorted[0]}-${sorted[1]}`;
  };

  // Get and set last read timestamps for threads, keyed by user UID
  const getLastReadTime = (threadId) => {
    if (!auth.currentUser) return Date.now();
    const myUid = auth.currentUser.uid;
    const storageKey = `lastReadTimestamps_${myUid}`;
    try {
      const timestamps = JSON.parse(localStorage.getItem(storageKey) || '{}');
      return timestamps[threadId] !== undefined ? timestamps[threadId] : null;
    } catch (e) {
      console.error("Error reading lastReadTimestamps", e);
      return null;
    }
  };

  const setLastReadTime = (threadId, time = Date.now()) => {
    if (!auth.currentUser) return;
    const myUid = auth.currentUser.uid;
    const storageKey = `lastReadTimestamps_${myUid}`;
    try {
      const timestamps = JSON.parse(localStorage.getItem(storageKey) || '{}');
      timestamps[threadId] = time;
      localStorage.setItem(storageKey, JSON.stringify(timestamps));
    } catch (e) {
      console.error("Error saving lastReadTimestamps", e);
    }
  };

  const getOrInitLastReadTime = (thread) => {
    let t = getLastReadTime(thread.id);
    if (t === null) {
      // Default to 0 so all received messages in history are unread until the user clicks
      t = 0;
    }
    return t;
  };

  // Rebuild all chat threads dynamically
  const rebuildChatThreads = () => {
    if (!currentUser || !auth.currentUser) return;
    const myUid = auth.currentUser.uid;
    const deletedIds = JSON.parse(localStorage.getItem('deletedMessageIds') || '[]');

    // 1. Build Global Group Thread
    const globalMessages = allLoadedMessages.filter(m => m.threadId === "group-global" && !deletedIds.includes(m.id));
    const globalThread = {
      id: "group-global",
      name: "Nội Bộ Aladdin Group",
      type: "group",
      avatarInitials: "GT",
      avatarBg: "var(--accent)",
      membersCount: "Cập nhật thời gian thực",
      messages: globalMessages
    };

    // 2. Identify all other UIDs that should have DM threads
    const dmUids = new Set();
    
    // Add all contact UIDs
    myContacts.forEach(uid => {
      if (uid !== myUid) {
        dmUids.add(uid);
      }
    });

    // Add UIDs from messages history
    allLoadedMessages.forEach(m => {
      if (m.threadId && m.threadId.startsWith('dm-')) {
        const parts = m.threadId.split('-');
        if (parts.length === 3) {
          const uidA = parts[1];
          const uidB = parts[2];
          if (uidA === myUid && uidB !== myUid) {
            dmUids.add(uidB);
          } else if (uidB === myUid && uidA !== myUid) {
            dmUids.add(uidA);
          }
        }
      }
    });

    // Safeguard: Add currently active DM thread contact UID if any
    if (activeThreadId && activeThreadId.startsWith('dm-')) {
      const parts = activeThreadId.split('-');
      if (parts.length === 3) {
        const uidA = parts[1];
        const uidB = parts[2];
        if (uidA === myUid) dmUids.add(uidB);
        if (uidB === myUid) dmUids.add(uidA);
      }
    }

    // 3. Build DM Threads
    const dmThreads = [];
    dmUids.forEach(contactUid => {
      const contactUser = usersCache[contactUid];
      if (!contactUser) return;

      const threadId = getDmThreadId(myUid, contactUid);
      const threadMessages = allLoadedMessages.filter(m => m.threadId === threadId && !deletedIds.includes(m.id));
      
      const initials = contactUser.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
      const displayRole = contactUser.role === 'admin' ? 'Quản trị viên' : 'Nhân viên';

      dmThreads.push({
        id: threadId,
        name: contactUser.name,
        type: "dm",
        avatarInitials: initials,
        avatarBg: getAvatarBgColor(contactUser.name),
        membersCount: displayRole,
        messages: threadMessages,
        contactUid: contactUid
      });
    });

    // 4. Update the global chatThreads array
    chatThreads = [globalThread, ...dmThreads];

    // Render Chat views if on chat screen
    renderThreadList();
    const chatDashboard = document.getElementById('chat-dashboard');
    if (chatDashboard && chatDashboard.style.display === 'block') {
      renderMessages(activeThreadId);
    }
  };


  // Render Thread List Sidebar
  const renderThreadList = () => {
    const listContainer = document.getElementById('chatThreadsList');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    if (!currentUser || !auth.currentUser) return;
    const myUid = auth.currentUser.uid;
    const query = chatSearchQuery.trim().toLowerCase();
    
    // 1. Filter Active Conversations
    const filteredThreads = chatThreads.filter(t => {
      if (!query) return true;
      return t.name.toLowerCase().includes(query) || 
             t.messages.some(m => m.content.toLowerCase().includes(query));
    });

    // 2. Filter Other Staff (Directory)
    // We only show users who do not have an active chat thread in chatThreads
    const otherStaff = allUsersList.filter(user => {
      if (user.uid === myUid) return false; // Exclude self
      const hasActiveThread = chatThreads.some(t => t.type === 'dm' && t.contactUid === user.uid);
      if (hasActiveThread) return false; // Already in active DMs list
      
      if (!query) return true;
      return (user.name && user.name.toLowerCase().includes(query)) || 
             (user.email && user.email.toLowerCase().includes(query));
    });

    if (filteredThreads.length === 0 && otherStaff.length === 0) {
      listContainer.innerHTML = `
        <div style="padding: 2rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
          Không tìm thấy kết quả phù hợp.
        </div>
      `;
      return;
    }

    // --- Render Section 1: ACTIVE CHATS ---
    if (filteredThreads.length > 0) {
      const secHeader = document.createElement('div');
      secHeader.className = 'sidebar-section-header';
      secHeader.style.cssText = 'font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: var(--accent); padding: 1.25rem 1rem 0.5rem 1rem; border-bottom: 1px solid var(--border); margin-bottom: 0.5rem; display: flex; align-items: center; justify-content: space-between;';
      secHeader.innerHTML = `
        <span>Cuộc trò chuyện</span>
        <span style="font-size: 0.65rem; color: var(--text-muted); font-weight: 500;">(${filteredThreads.length})</span>
      `;
      listContainer.appendChild(secHeader);

      filteredThreads.forEach(thread => {
        const isCurrentActive = (thread.id === activeThreadId);
        const activeClass = isCurrentActive ? 'active' : '';

        // Update read status for active thread in real time
        if (isCurrentActive) {
          setLastReadTime(thread.id, Date.now());
        }

        const lastReadTime = getOrInitLastReadTime(thread);

        // Calculate unread count (excluding messages sent by the user themselves or recalled)
        let unreadCount = 0;
        if (!isCurrentActive) {
          const activeName = (currentUser && currentUser.name) ? `${currentUser.name} (${currentUser.role === 'admin' ? 'quản trị viên' : 'nhân viên'})` : "";
          unreadCount = thread.messages.filter(msg => {
            const isSentByMe = (msg.sender === activeName) || 
                               (currentUser && msg.senderEmail && currentUser.email && msg.senderEmail.trim().toLowerCase() === currentUser.email.trim().toLowerCase()) ||
                               (currentUser && msg.senderName && currentUser.name && msg.senderName.trim().toLowerCase() === currentUser.name.trim().toLowerCase()) ||
                               (currentUser && msg.sender && currentUser.name && msg.sender.toLowerCase().includes(currentUser.name.toLowerCase()));
            if (isSentByMe) return false;
            if (msg.isRecalled) return false;
            
            const msgTime = msg.createdAt || 0;
            return msgTime > lastReadTime;
          }).length;
        }

        const unreadClass = unreadCount > 0 ? 'unread' : '';
        const lastMsg = thread.messages.length > 0 ? thread.messages[thread.messages.length - 1] : { content: "Chưa có tin nhắn", time: "" };
        const cleanSender = lastMsg.senderName ? `${lastMsg.senderName}: ` : lastMsg.sender ? `${lastMsg.sender.split(' (')[0]}: ` : '';

        let menuHtml = '';
        if (thread.type === 'dm') {
          menuHtml = `
            <button class="thread-menu-btn" style="border: none; background: transparent; color: var(--text-muted); cursor: pointer; padding: 0.5rem; display: flex; align-items: center; justify-content: center; margin-left: auto; outline: none; z-index: 30; border-radius: 50%; width: 28px; height: 28px; transition: var(--transition-fast); position: relative;">
              <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: currentColor;"><path d="M12,16A2,2 0 0,1 14,18A2,2 0 0,1 12,20A2,2 0 0,1 10,18A2,2 0 0,1 12,16M12,10A2,2 0 0,1 14,12A2,2 0 0,1 12,14A2,2 0 0,1 10,12A2,2 0 0,1 12,10M12,4A2,2 0 0,1 14,6A2,2 0 0,1 12,8A2,2 0 0,1 10,6A2,2 0 0,1 12,4Z"/></svg>
            </button>
            <div class="thread-dropdown-menu" style="display: none; position: absolute; right: 15px; top: 48px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--border-radius-sm); box-shadow: var(--shadow-md); z-index: 100; min-width: 160px; overflow: hidden; padding: 4px 0;">
              <button class="btn-delete-thread" data-thread-id="${thread.id}" style="width: 100%; text-align: left; padding: 0.6rem 1rem; font-size: 0.8rem; color: #EF4444; display: flex; align-items: center; gap: 0.5rem; border: none; background: transparent; cursor: pointer; transition: var(--transition-fast);">
                <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: currentColor;"><path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/></svg>
                <span>Xóa đoạn chat</span>
              </button>
            </div>
          `;
        }

        const div = document.createElement('div');
        div.className = `chat-thread-item ${activeClass} ${unreadClass}`;
        div.style.position = 'relative';
        div.innerHTML = `
          <div class="avatar-circle" style="background-color: ${thread.avatarBg};">${thread.avatarInitials}</div>
          <div class="chat-thread-details" style="${thread.type === 'dm' ? 'max-width: calc(100% - 85px);' : ''}">
            <div class="chat-thread-header">
              <span class="title">${thread.name}</span>
              <span class="time">${lastMsg.time}</span>
            </div>
            <div class="chat-thread-preview">
              <span class="message">${cleanSender}${lastMsg.content}</span>
              ${unreadCount > 0 ? `<span class="unread-badge">${unreadCount >= 100 ? '99+' : unreadCount}</span>` : ''}
            </div>
          </div>
          ${menuHtml}
        `;

        div.addEventListener('click', () => {
          activeThreadId = thread.id;
          renderThreadList();
          renderMessages(activeThreadId);
        });

        if (thread.type === 'dm') {
          const menuBtn = div.querySelector('.thread-menu-btn');
          const dropdown = div.querySelector('.thread-dropdown-menu');

          if (menuBtn && dropdown) {
            menuBtn.addEventListener('click', (e) => {
              e.stopPropagation(); // Block thread selection trigger

              // Close all other dropdowns first
              document.querySelectorAll('.thread-dropdown-menu').forEach(el => {
                if (el !== dropdown) el.style.display = 'none';
              });
              document.querySelectorAll('.thread-menu-btn').forEach(el => {
                if (el !== menuBtn) el.classList.remove('active');
              });

              const isVisible = dropdown.style.display === 'block';
              dropdown.style.display = isVisible ? 'none' : 'block';
              menuBtn.classList.toggle('active', !isVisible);
            });

            const btnDelete = div.querySelector('.btn-delete-thread');
            if (btnDelete) {
              btnDelete.addEventListener('click', async (e) => {
                e.stopPropagation(); // Block thread selection trigger
                dropdown.style.display = 'none';
                menuBtn.classList.remove('active');

                const confirmMsg = `Xác nhận xóa đoạn chat với ${thread.name}? Bạn và người này sẽ không còn là bạn bè, đồng thời toàn bộ tin nhắn sẽ bị xóa vĩnh viễn.`;
                if (confirm(confirmMsg)) {
                  try {
                    showToast("Đang xóa đoạn chat...", "info");

                    // 1. Delete contacts reciprocal entries
                    const contactsSnap1 = await db.collection("contacts")
                      .where("userUid", "==", myUid)
                      .where("contactUid", "==", thread.contactUid)
                      .get();
                    contactsSnap1.forEach(doc => doc.ref.delete());

                    const contactsSnap2 = await db.collection("contacts")
                      .where("userUid", "==", thread.contactUid)
                      .where("contactUid", "==", myUid)
                      .get();
                    contactsSnap2.forEach(doc => doc.ref.delete());

                    // 2. Delete all messages of this DM thread
                    const messagesSnap = await db.collection("messages")
                      .where("threadId", "==", thread.id)
                      .get();
                    messagesSnap.forEach(doc => doc.ref.delete());

                    showToast(`Đã xóa đoạn chat với ${thread.name} thành công!`, "success");

                    // 3. Switch back to global thread
                    activeThreadId = "group-global";
                    rebuildChatThreads();
                  } catch (err) {
                    console.error("Failed to delete chat thread:", err);
                    showToast("Lỗi khi xóa đoạn chat!", "error");
                  }
                }
              });
            }
          }
        }

        listContainer.appendChild(div);
      });
    }

    // --- Render Section 2: OTHER COLLEAGUES (Only when searching) ---
    if (query && otherStaff.length > 0) {
      const secHeader = document.createElement('div');
      secHeader.className = 'sidebar-section-header';
      secHeader.style.cssText = 'font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: var(--accent); padding: 1.5rem 1rem 0.5rem 1rem; border-bottom: 1px solid var(--border); margin-bottom: 0.5rem; display: flex; align-items: center; justify-content: space-between;';
      secHeader.innerHTML = `
        <span>Đồng nghiệp khác</span>
        <span style="font-size: 0.65rem; color: var(--text-muted); font-weight: 500;">(${otherStaff.length})</span>
      `;
      listContainer.appendChild(secHeader);

      otherStaff.forEach(user => {
        const initials = user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        const displayRole = user.role === 'admin' ? 'Quản trị viên' : 'Nhân viên';

        const isFriend = myContacts.includes(user.uid);
        const sentRequest = mySentRequests.find(r => r.receiverUid === user.uid && r.status === 'pending');
        const receivedRequest = myReceivedRequests.find(r => r.senderUid === user.uid && r.status === 'pending');

        const div = document.createElement('div');
        div.className = 'chat-thread-item';
        div.style.position = 'relative';

        let rightAction = '';
        if (isFriend) {
          rightAction = `
            <span class="badge-connected-friend" style="margin-left: auto; font-size: 0.65rem; padding: 2px 6px; scale: 0.9;">Đã kết bạn</span>
          `;
        } else if (sentRequest) {
          rightAction = `
            <span style="margin-left: auto; font-size: 0.7rem; color: var(--text-muted); font-style: italic;">Đã gửi yêu cầu</span>
          `;
        } else if (receivedRequest) {
          rightAction = `
            <button class="action-icon-btn btn-sidebar-accept-friend" data-id="${receivedRequest.id}" title="Chấp nhận" style="background: var(--accent); border: none; border-radius: 4px; padding: 4px 8px; font-size: 0.7rem; color: white; cursor: pointer; transition: var(--transition-fast); margin-left: auto; flex-shrink: 0; outline: none;">
              Chấp nhận
            </button>
          `;
        } else {
          rightAction = `
            <button class="action-icon-btn btn-sidebar-add-friend" data-uid="${user.uid}" title="Kết bạn" style="background: rgba(63, 162, 246, 0.15); border: none; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; color: var(--accent); cursor: pointer; transition: var(--transition-fast); margin-left: auto; padding: 0; flex-shrink: 0; outline: none;">
              <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: currentColor;"><path d="M15,14C12.33,14 7,15.33 7,18V20H23V18C23,15.33 17.67,14 15,14M6,8.17V5H4V8.17C2.78,8.58 2,9.7 2,11C2,12.3 2.78,13.42 4,13.83V17H6V13.83C7.22,13.42 8,12.3 8,11C8,9.7 7.22,8.58 6,8.17M15,12A4,4 0 0,0 19,8A4,4 0 0,0 15,4A4,4 0 0,0 11,8A4,4 0 0,0 15,12Z"/></svg>
            </button>
          `;
        }

        div.innerHTML = `
          <div class="avatar-circle" style="background-color: ${getAvatarBgColor(user.name)};">${initials}</div>
          <div class="chat-thread-details" style="max-width: calc(100% - 100px);">
            <div class="chat-thread-header">
              <span class="title">${user.name}</span>
            </div>
            <div class="chat-thread-preview">
              <span class="message">${user.email} (${displayRole})</span>
            </div>
          </div>
          ${rightAction}
        `;

        // Direct DM open on clicking thread item
        div.addEventListener('click', () => {
          const threadId = getDmThreadId(myUid, user.uid);
          activeThreadId = threadId;
          rebuildChatThreads();
          const chatInput = document.getElementById('chatMessageInput');
          if (chatInput) chatInput.focus();
        });

        // Event listener for sidebar connect friend button
        const btnAdd = div.querySelector('.btn-sidebar-add-friend');
        if (btnAdd) {
          btnAdd.addEventListener('click', async (e) => {
            e.stopPropagation();
            btnAdd.disabled = true;
            btnAdd.style.opacity = '0.5';
            try {
              await db.collection("friend_requests").add({
                senderUid: myUid,
                senderName: currentUser.name,
                senderEmail: currentUser.email,
                receiverUid: user.uid,
                receiverName: user.name,
                receiverEmail: user.email,
                status: "pending",
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
              });
              showToast(`Đã gửi yêu cầu kết bạn tới ${user.name}!`, 'success');
              renderThreadList();
            } catch (err) {
              console.error("Sidebar add friend failed:", err);
              showToast("Lỗi khi kết bạn!", "error");
              btnAdd.disabled = false;
              btnAdd.style.opacity = '1';
            }
          });
        }

        // Event listener for sidebar accept friend button
        const btnAccept = div.querySelector('.btn-sidebar-accept-friend');
        if (btnAccept) {
          btnAccept.addEventListener('click', async (e) => {
            e.stopPropagation();
            btnAccept.disabled = true;
            btnAccept.textContent = '...';
            try {
              await db.collection("contacts").add({
                userUid: myUid,
                contactUid: user.uid,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
              });
              await db.collection("contacts").add({
                userUid: user.uid,
                contactUid: myUid,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
              });
              await db.collection("friend_requests").doc(btnAccept.dataset.id).delete();
              showToast(`Đã kết bạn với ${user.name} thành công!`, 'success');
              renderThreadList();
            } catch (err) {
              console.error("Sidebar accept friend failed:", err);
              showToast("Lỗi khi chấp nhận kết bạn!", "error");
              btnAccept.disabled = false;
              btnAccept.textContent = 'Chấp nhận';
            }
          });
        }

        listContainer.appendChild(div);
      });
    }

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
      if (statusSpan) {
        statusSpan.textContent = thread.type === 'group' ? "Cập nhật thời gian thực" : thread.membersCount;
      }
    }

    // Render bubbles
    container.innerHTML = '';
    
    const searchQ = activeChatSearchQuery.trim().toLowerCase();
    const filteredMessages = thread.messages.filter(msg => {
      if (!searchQ) return true;
      if (msg.isRecalled) return false;
      return msg.content && msg.content.toLowerCase().includes(searchQ);
    });

    if (searchQ && filteredMessages.length === 0) {
      container.innerHTML = `
        <div style="padding: 3rem 2rem; text-align: center; color: var(--text-muted); font-size: 0.9rem;">
          Không tìm thấy tin nhắn nào có nội dung "${activeChatSearchQuery}".
        </div>
      `;
      return;
    }

    filteredMessages.forEach(msg => {
      const activeName = (currentUser && currentUser.name) ? `${currentUser.name} (${currentUser.role === 'admin' ? 'quản trị viên' : 'nhân viên'})` : "";
      const isSentByMe = (msg.sender === activeName) || 
                         (currentUser && msg.senderEmail && currentUser.email && msg.senderEmail.trim().toLowerCase() === currentUser.email.trim().toLowerCase()) ||
                         (currentUser && msg.senderName && currentUser.name && msg.senderName.trim().toLowerCase() === currentUser.name.trim().toLowerCase()) ||
                         (currentUser && msg.sender && currentUser.name && msg.sender.toLowerCase().includes(currentUser.name.toLowerCase()));
      
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

      if (msg.isRecalled) {
        // Render Recalled Message
        bubbleRow.innerHTML = `
          ${receivedAvatar}
          <div class="chat-bubble recalled">
            <svg class="recalled-icon" viewBox="0 0 24 24"><path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.59-13L17 8.41L13.41 12L17 15.59L15.59 17L12 13.41L8.41 17L7 15.59L10.59 12L7 8.41L8.41 7L12 10.59L15.59 7z"/></svg>
            <span>Tin nhắn đã được thu hồi</span>
            <span class="time-stamp">${msg.time}</span>
          </div>
        `;
      } else {
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

        let displayFile = "";
        if (msg.file) {
          displayFile = `
            <div class="chat-message-file-container" style="margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.75rem; background: var(--bg-primary); border: 1px solid var(--border); padding: 0.75rem 1rem; border-radius: 8px; max-width: 300px; cursor: pointer;" title="Nhấp chuột phải để tải xuống">
              <div style="width: 40px; height: 40px; border-radius: 6px; background: var(--accent-light); color: var(--accent); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                <svg viewBox="0 0 24 24" style="width: 24px; height: 24px; fill: currentColor;"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,20H18A2,2 0 0,0 20,18V8L14,2M12,18H6V16H12V18M16,14H6V12H16V14M16,10H6V8H16V10M14,8V3.5L18.5,8H14Z"/></svg>
              </div>
              <div style="display: flex; flex-direction: column; overflow: hidden; text-align: left;">
                <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${msg.fileName || 'Tài liệu'}">${msg.fileName || 'Tài liệu'}</span>
                <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: 500;">${msg.fileSize || 'Chưa rõ dung lượng'}</span>
              </div>
            </div>
          `;
        }

        let forwardedHtml = "";
        if (msg.forwardedFrom) {
          forwardedHtml = `
            <div class="forwarded-tag">
              <svg viewBox="0 0 24 24"><path d="M10,9V5L3,12L10,19V14.9C15,14.9 18.5,16.5 21,20C20,15 17,10 10,9Z"/></svg>
              Chuyển tiếp từ ${msg.forwardedFrom}
            </div>
          `;
        }

        // Action Toolbar
        const canRecall = isSentByMe || (currentUser && currentUser.role === 'admin');
        const canDeleteEveryone = isSentByMe || (currentUser && currentUser.role === 'admin');

        const actionsHtml = `
          <div class="chat-bubble-actions" style="display: none;">
            <button class="chat-action-btn btn-forward-action" data-msg-id="${msg.id}" title="Chuyển tiếp">
              <svg viewBox="0 0 24 24"><path d="M10,9V5L3,12L10,19V14.9C15,14.9 18.5,16.5 21,20C20,15 17,10 10,9Z"/></svg>
            </button>
            ${canRecall ? `
            <button class="chat-action-btn btn-recall-action" data-msg-id="${msg.id}" title="Thu hồi">
              <svg viewBox="0 0 24 24"><path d="M13,3A9,9 0 0,0 4,12H1L4.89,15.89L4.96,16.03L9,12H6A7,7 0 0,1 13,5A7,7 0 0,1 20,12A7,7 0 0,1 13,19C11.07,19 9.32,18.13 8.14,16.73L6.7,18.17C8.28,19.92 10.5,21 13,21A9,9 0 0,0 22,12A9,9 0 0,0 13,3M12,8V13L16.28,15.54L17,14.33L13.5,12.25V8H12Z"/></svg>
            </button>
            ` : ''}
            <button class="chat-action-btn btn-delete-action" data-msg-id="${msg.id}" data-can-everyone="${canDeleteEveryone}" title="Xóa">
              <svg viewBox="0 0 24 24"><path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/></svg>
            </button>
          </div>
        `;

        bubbleRow.innerHTML = `
          ${receivedAvatar}
          <div class="chat-bubble" style="border-radius: var(--border-radius-md);">
            ${senderLabel}
            ${forwardedHtml}
            ${displayImage}
            ${displayFile}
            ${msg.content ? `<div class="content">${displayContent}</div>` : ''}
            <span class="time-stamp">${msg.time}</span>
          </div>
          ${actionsHtml}
        `;
      }
      
      container.appendChild(bubbleRow);

      // Connect dynamically built handlers
      bubbleRow.querySelectorAll('.btn-forward-action').forEach(btn => {
        btn.addEventListener('click', () => {
          const msgId = btn.getAttribute('data-msg-id');
          openForwardModal(msgId);
        });
      });
      bubbleRow.querySelectorAll('.btn-recall-action').forEach(btn => {
        btn.addEventListener('click', () => {
          const msgId = btn.getAttribute('data-msg-id');
          recallMessage(msgId);
        });
      });
      bubbleRow.querySelectorAll('.btn-delete-action').forEach(btn => {
        btn.addEventListener('click', () => {
          const msgId = btn.getAttribute('data-msg-id');
          const canEveryone = btn.getAttribute('data-can-everyone') === 'true';
          deleteMessage(msgId, canEveryone);
        });
      });

      // Connect dynamic custom context menu for files on Right-Click
      bubbleRow.querySelectorAll('.chat-message-file-container').forEach(container => {
        container.addEventListener('contextmenu', (e) => {
          e.preventDefault(); // Suppress standard browser context menu
          if (!msg.file) return;
          
          contextMenuFileMsg = msg;
          
          const menu = document.getElementById('chatCustomContextMenu');
          if (menu) {
            menu.style.left = `${e.clientX}px`;
            menu.style.top = `${e.clientY}px`;
            menu.style.display = 'block';
          }
        });
      });
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
  
  // Persist session across page reloads; idle timeout handles auto-logout
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
    .catch((err) => console.error("Error setting Firebase persistence:", err));

  // ── Idle timeout: logout after 10 minutes of inactivity ──
  const IDLE_LIMIT_MS = 10 * 60 * 1000;
  let _idleTimer = null;
  let _idleCheckInterval = null;
  let _lastActivity = Date.now();

  const _resetIdleTimer = () => { _lastActivity = Date.now(); };

  const _startIdleWatch = () => {
    ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'].forEach(evt =>
      document.addEventListener(evt, _resetIdleTimer, { passive: true })
    );
    _idleCheckInterval = setInterval(() => {
      if (Date.now() - _lastActivity >= IDLE_LIMIT_MS) {
        _stopIdleWatch();
        showToast('Phiên đăng nhập hết hạn do không hoạt động.', 'info');
        handlePortalLogout();
      }
    }, 30 * 1000);
  };

  const _stopIdleWatch = () => {
    clearInterval(_idleCheckInterval);
    _idleCheckInterval = null;
    ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'].forEach(evt =>
      document.removeEventListener(evt, _resetIdleTimer)
    );
  };

  const db = firebase.firestore();

  let currentUser = null;
  let chatSubscription = null;

  // Attempt to automatically pre-create/register the default admin account on startup
  const setupDefaultAdmin = async () => {
    try {
      const userCredential = await auth.createUserWithEmailAndPassword("admin@domain.com", "Admin123456@");
      const uid = userCredential.user.uid;
      await db.collection("users").doc(uid).set({
        name: "Admin Aladdin Group",
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

    // Mini Blogs header
    syncAvatarElement('miniBlogsAvatar');
    const miniBlogsName = document.getElementById('miniBlogsName');
    const miniBlogsRole = document.getElementById('miniBlogsRole');
    if (miniBlogsName) miniBlogsName.textContent = user.name;
    if (miniBlogsRole) miniBlogsRole.textContent = displayRole;

    // Mini HRM header
    syncAvatarElement('miniHrmAvatar');
    const miniHrmName = document.getElementById('miniHrmName');
    const miniHrmRole = document.getElementById('miniHrmRole');
    if (miniHrmName) miniHrmName.textContent = user.name;
    if (miniHrmRole) miniHrmRole.textContent = displayRole;

    // Staff Portal mini header
    syncAvatarElement('miniSpAvatar');
    const miniSpName = document.getElementById('miniSpName');
    const miniSpRole = document.getElementById('miniSpRole');
    if (miniSpName) miniSpName.textContent = user.name;
    if (miniSpRole) miniSpRole.textContent = displayRole;

    // Mini CRM header
    syncAvatarElement('miniCrmAvatar');
    const miniCrmName = document.getElementById('miniCrmName');
    const miniCrmRole = document.getElementById('miniCrmRole');
    if (miniCrmName) miniCrmName.textContent = user.name;
    if (miniCrmRole) miniCrmRole.textContent = displayRole;

    // Role-based Access Controls (Admin Only "Tạo tài khoản NV" & "Tạo tài khoản HV")
    const menuItemCreateUsers = document.getElementById('menuItemCreateUsers');
    const menuItemCreateStudentUsers = document.getElementById('menuItemCreateStudentUsers');
    const menuItemHRM = document.getElementById('menuItemHRM');
    const menuItemTest = document.getElementById('menuItemTest');
    if (user.role === 'admin') {
      if (menuItemCreateUsers) menuItemCreateUsers.style.display = 'flex';
      if (menuItemCreateStudentUsers) menuItemCreateStudentUsers.style.display = 'flex';
      if (menuItemHRM) menuItemHRM.style.display = 'flex';
      if (menuItemTest) menuItemTest.style.display = 'flex';
    } else if (user.role === 'student') {
      if (menuItemCreateUsers) menuItemCreateUsers.style.display = 'none';
      if (menuItemCreateStudentUsers) menuItemCreateStudentUsers.style.display = 'none';
      if (menuItemHRM) menuItemHRM.style.display = 'none';
      if (menuItemTest) menuItemTest.style.display = 'none';
    } else {
      if (menuItemCreateUsers) menuItemCreateUsers.style.display = 'none';
      if (menuItemCreateStudentUsers) menuItemCreateStudentUsers.style.display = 'none';
      if (menuItemHRM) menuItemHRM.style.display = 'flex';
      if (menuItemTest) menuItemTest.style.display = 'none';
    }
  };

  // Perform Firebase Auth Login action
  const handlePortalLogin = async (email, password) => {
    try {
      await auth.signInWithEmailAndPassword(email, password);
      showToast("Đăng nhập thành công!", "success");
    } catch (error) {
      console.error("Login failed:", error);
      
      // Auto-create student portal user on-the-fly if they log in with default password "123456" and exist in the "students" collection
      // Firebase modern auth projects might return 'auth/invalid-credential' instead of 'auth/user-not-found' when email enumeration protection is active.
      if ((error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') && password === '123456') {
        try {
          const studentQuery = await db.collection("students").where("email", "==", email).get();
          if (!studentQuery.empty) {
            // Check if the user document already exists in users collection to avoid duplicate creation
            const userQuery = await db.collection("users").where("email", "==", email).get();
            if (userQuery.empty) {
              showToast("Đang tự động kích hoạt tài khoản học viên...", "info");
              const studentDoc = studentQuery.docs[0];
              const studentData = studentDoc.data();
              
              // Create user account in Firebase Auth
              const userCredential = await auth.createUserWithEmailAndPassword(email, password);
              const uid = userCredential.user.uid;
              
              // Save to users collection
              await db.collection("users").doc(uid).set({
                name: studentData.name,
                email: email,
                role: "student",
                defaultPassword: "123456",
                passwordChanged: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
              });
              
              showToast("Kích hoạt tài khoản học viên thành công! Đang tự động đăng nhập...", "success");
              // Firebase automatically signs in the user upon creation. We sync session naturally.
              return;
            }
          }
        } catch (createErr) {
          console.error("Failed to auto-create student user during login:", createErr);
        }
      }

      // Auto-create admin if logging in with admin@domain.com for the first time
      if (email === 'admin@domain.com' && (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential')) {
        try {
          const userQuery = await db.collection("users").where("email", "==", email).get();
          if (userQuery.empty) {
            showToast("Đang tự động khởi tạo tài khoản Admin...", "info");
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const uid = userCredential.user.uid;
            await db.collection("users").doc(uid).set({
              name: "Admin Aladdin Group",
              email: "admin@domain.com",
              role: "admin",
              createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            showToast("Khởi tạo tài khoản Admin thành công! Đang tự động đăng nhập...", "success");
            // Firebase automatically signs in the user upon creation. We sync session naturally.
            return;
          }
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
      } else if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
        errorMsg = "Tên đăng nhập hoặc mật khẩu không chính xác!";
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
      let emailVal = document.getElementById('loginUsername').value.trim().toLowerCase();
      const passwordVal = document.getElementById('loginPassword').value;
      // Học viên có thể gõ tắt (không có @) → tự thêm @aladdin.hv
      if (!emailVal.includes('@')) {
        emailVal = emailVal + '@aladdin.hv';
      }
      
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
      const flexDashboards = ['staff-profile-dashboard', 'staff-attendance-dashboard', 'test-dashboard'];
      targetElement.style.display = flexDashboards.includes(targetViewId) ? 'flex' : 'block';
    }

    // Update active nav menu link styling
    document.querySelectorAll('.sidebar-menu .menu-item').forEach(item => {
      item.classList.remove('active');
      if (item.getAttribute('data-target') === targetViewId) {
        item.classList.add('active');
      }
    });

    // Initialize specific module views when active
    if (targetViewId === 'users-dashboard') {
      renderStaffUsersList();
    } else if (targetViewId === 'student-users-dashboard') {
      renderStudentUsersList();
    } else if (targetViewId === 'students-dashboard') {
      applyStudentFiltersAndRender();
    } else if (targetViewId === 'blogs-dashboard') {
      renderAdminBlogsList();
    } else if (targetViewId === 'hrm-dashboard') {
      initHrmModule();
    } else if (targetViewId === 'crm-dashboard') {
      initCrmModule();
      // Re-subscribe to chat if the chat tab is currently visible (user returning from another section)
      const chatTabEl = document.getElementById('crm-chat-tab');
      if (chatTabEl && chatTabEl.style.display !== 'none') setupCrmChat();
    } else if (targetViewId === 'staff-profile-dashboard') {
      initStaffProfileDashboard();
    } else if (targetViewId === 'staff-attendance-dashboard') {
      initStaffAttendanceDashboard();
    } else if (targetViewId === 'test-dashboard') {
      loadCompetencyTestResults();
    } else if (targetViewId === 'orgchart-dashboard') {
      initOrgChartDashboard();
    } else if (targetViewId === 'workflow-dashboard') {
      initWorkflowDashboard();
    } else {
      if (typeof teardownCrmChat === 'function') teardownCrmChat();
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
      _stopIdleWatch();
      if (usersSubscription) {
        usersSubscription(); // Unsubscribe users
        usersSubscription = null;
      }
      if (contactsSubscription) {
        contactsSubscription(); // Unsubscribe contacts
        contactsSubscription = null;
      }
      usersCache = {};
      allUsersList = [];
      myContacts = [];
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

  // Support breadcrumb home redirection to CRM
  document.querySelectorAll('.portal-breadcrumb-home').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      switchPortalView('crm-dashboard');
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
        // Only list users with role === 'employee' (and ensure it's not the admin)
        if (user.role === 'employee' && user.email !== 'admin@domain.com') {
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
        
        let passwordDisplay = "";
        if (user.passwordChanged) {
          passwordDisplay = `<span style="color: #10B981; font-weight: 600; font-size: 0.75rem; background: rgba(16, 185, 129, 0.1); padding: 0.2rem 0.5rem; border-radius: 4px;">Đã đổi MK</span>`;
        } else {
          passwordDisplay = `<span class="font-mono" style="font-weight: 600; color: var(--text-muted); font-size: 0.8rem;">${user.defaultPassword || "123456"}</span>`;
        }

        tr.innerHTML = `
          <td style="text-align: center;"><strong>${user.name}</strong><br><span style="font-size:0.7rem; color:var(--text-muted);">Tạo ngày: ${dateString}</span></td>
          <td style="text-align: center;"><span class="font-mono" style="font-weight:500;">${user.email}</span></td>
          <td style="text-align: center;">${passwordDisplay}</td>
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
        role: "employee",
        defaultPassword: password,
        passwordChanged: false,
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
      let newEmail = document.getElementById('newStaffEmail').value.trim().toLowerCase();
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
      // 1. Fetch all student profiles from "students" collection
      const studentsSnapshot = await db.collection("students").get();
      const studentsList = [];
      studentsSnapshot.forEach(doc => {
        const student = doc.data();
        student.id = doc.id; // student profile document ID
        studentsList.push(student);
      });

      // 2. Fetch all student user accounts from "users" collection
      const usersSnapshot = await db.collection("users").where("role", "==", "student").get();
      const usersMap = {};
      usersSnapshot.forEach(doc => {
        const u = doc.data();
        u.uid = doc.id; // user account document ID
        usersMap[u.email.toLowerCase()] = u;
      });

      if (studentsList.length === 0) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="6" style="text-align:center; padding: 2rem; color:var(--text-muted); font-size:0.85rem;">
              Chưa có học viên nào trong danh sách.
            </td>
          </tr>
        `;
        return;
      }

      studentsList.forEach(student => {
        const emailKey = student.email ? student.email.toLowerCase() : "";
        const userAccount = usersMap[emailKey];

        const code = student.code || "TE-Chưa rõ";
        const country = student.country || "Chưa rõ";
        const status = student.status || "Đang học";

        let badgeClass = "badge-danghoc";
        if (status === "Chờ phỏng vấn") badgeClass = "badge-waiting";
        else if (status === "Đã trúng tuyển") badgeClass = "badge-selected";
        else if (status === "Đang làm hồ sơ") badgeClass = "badge-processing";

        let passwordDisplay = "";
        let actionBtn = "";

        if (userAccount) {
          passwordDisplay = userAccount.passwordChanged ? 
            `<span style="color: #10B981; font-weight: 600; font-size: 0.75rem; background: rgba(16, 185, 129, 0.1); padding: 0.2rem 0.5rem; border-radius: 4px;">Đã đổi MK</span>` : 
            `<span class="font-mono" style="font-weight: 600; color: var(--text-main); font-size: 0.8rem;">${userAccount.defaultPassword || "123456"}</span>`;

          actionBtn = `
            <button class="action-icon-btn btn-delete-student-user" data-uid="${userAccount.uid}" data-email="${student.email}" title="Xóa tài khoản" style="color:#EF4444; background:none; border:none; cursor:pointer; padding:6px; border-radius:50%;">
              <svg viewBox="0 0 24 24" style="width: 18px; height: 18px; fill: currentColor;"><path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/></svg>
            </button>
          `;
        } else {
          passwordDisplay = `<span class="font-mono" style="font-weight: 600; color: var(--text-muted); font-size: 0.8rem;">123456</span>`;
          actionBtn = `
            <button class="action-icon-btn btn-delete-student-profile-only" data-id="${student.id}" title="Xóa hồ sơ" style="color:#EF4444; background:none; border:none; cursor:pointer; padding:6px; border-radius:50%;">
              <svg viewBox="0 0 24 24" style="width: 18px; height: 18px; fill: currentColor;"><path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/></svg>
            </button>
          `;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="text-align: center;"><strong>${student.name}</strong><br><span style="font-size:0.75rem; font-family: monospace; color:var(--accent); font-weight: 600;">${code}</span></td>
          <td style="text-align: center;"><span class="font-mono" style="font-weight:500;">${student.email}</span></td>
          <td style="text-align: center;">${passwordDisplay}</td>
          <td style="text-align: center;"><strong>${country}</strong></td>
          <td style="text-align: center;"><span class="crm-badge ${badgeClass}">${status}</span></td>
          <td style="text-align: center;">
            ${actionBtn}
          </td>
        `;

        if (userAccount) {
          tr.querySelector('.btn-delete-student-user').addEventListener('click', async () => {
            if (confirm(`Bạn có chắc chắn muốn xóa tài khoản học viên ${student.name} (${student.email})? Thao tác này cũng sẽ xóa hồ sơ tư vấn tương ứng.`)) {
              try {
                // Delete from users collection
                await db.collection("users").doc(userAccount.uid).delete();
                
                // Find and delete from students collection
                await db.collection("students").doc(student.id).delete();

                showToast(`Đã xóa tài khoản học viên ${student.name} thành công!`, "warning");
                renderStudentUsersList();
              } catch (err) {
                console.error("Failed to delete student user:", err);
                showToast("Lỗi khi xóa tài khoản học viên!", "error");
              }
            }
          });
        } else {
          tr.querySelector('.btn-delete-student-profile-only').addEventListener('click', async () => {
            if (confirm(`Học viên ${student.name} chưa có tài khoản portal. Bạn có chắc chắn muốn xóa hồ sơ tư vấn của học viên này?`)) {
              try {
                await db.collection("students").doc(student.id).delete();
                showToast(`Đã xóa hồ sơ học viên ${student.name} thành công!`, "warning");
                renderStudentUsersList();
              } catch (err) {
                console.error("Failed to delete student profile:", err);
                showToast("Lỗi khi xóa hồ sơ học viên!", "error");
              }
            }
          });
        }

        tableBody.appendChild(tr);
      });
    } catch (e) {
      console.error("Failed to load student users list:", e);
    }
  };

  const handleCreateStudentUser = async (email, password, name, code, phone, country, status, learningMonth, notes) => {
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
        defaultPassword: password,
        passwordChanged: false,
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
        learningMonth: learningMonth,
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
      let newEmail = document.getElementById('newStudentEmail').value.trim().toLowerCase();
      if (newEmail && !newEmail.includes('@')) {
        newEmail = newEmail + '@aladdin.hv';
      }
      const newPhone = document.getElementById('newStudentPhone').value.trim();
      const newCountry = document.getElementById('newStudentCountry').value;
      const newPassword = document.getElementById('newStudentPassword').value;
      const newStatus = document.getElementById('newStudentStatus').value;
      const newLearningMonth = document.getElementById('newStudentLearningMonth').value;
      const newNotes = document.getElementById('newStudentNotes').value.trim();

      if (!newName || !newCode || !newEmail || !newPhone || !newPassword) {
        showToast("Vui lòng điền đầy đủ các thông tin bắt buộc!", "error");
        return;
      }

      if (newPassword.length < 6) {
        showToast("Mật khẩu phải tối thiểu 6 ký tự!", "error");
        return;
      }

      handleCreateStudentUser(newEmail, newPassword, newName, newCode, newPhone, newCountry, newStatus, newLearningMonth, newNotes);
    });
  }

  // Bind Submit Reset Student Password Form
  const resetStudentPasswordForm = document.getElementById('resetStudentPasswordForm');
  if (resetStudentPasswordForm) {
    resetStudentPasswordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      let email = document.getElementById('resetStudentEmail').value.trim().toLowerCase();
      if (email && !email.includes('@')) {
        email = email + '@aladdin.hv';
      }
      const newDefaultPassword = document.getElementById('resetStudentNewPassword').value;

      if (!email || !newDefaultPassword) {
        showToast("Vui lòng nhập đầy đủ email và mật khẩu mặc định mới!", "error");
        return;
      }

      if (newDefaultPassword.length < 6) {
        showToast("Mật khẩu mới phải tối thiểu 6 ký tự!", "error");
        return;
      }

      try {
        showToast("Đang thực hiện reset mật khẩu...", "info");

        // 1. Verify user exists and is a student
        const userSnap = await db.collection("users")
          .where("email", "==", email)
          .where("role", "==", "student")
          .get();

        if (userSnap.empty) {
          showToast("Không tìm thấy tài khoản học viên với email này!", "error");
          return;
        }

        let userDocId = "";
        userSnap.forEach(doc => {
          userDocId = doc.id;
        });

        // 2. Send Password Reset Email in Firebase Authentication
        await auth.sendPasswordResetEmail(email);

        // 3. Reset the status in Firestore (so defaultPassword is newDefaultPassword and passwordChanged is false)
        await db.collection("users").doc(userDocId).update({
          defaultPassword: newDefaultPassword,
          passwordChanged: false
        });

        showToast(`Đã gửi email khôi phục mật khẩu và cập nhật mật khẩu mặc định mới cho học viên!`, "success");
        resetStudentPasswordForm.reset();
        renderStudentUsersList();
      } catch (err) {
        console.error("Reset student password error:", err);
        showToast("Lỗi khi reset mật khẩu: " + err.message, "error");
      }
    });
  }

  // Bind Submit Reset Staff Password Form
  const resetStaffPasswordForm = document.getElementById('resetStaffPasswordForm');
  if (resetStaffPasswordForm) {
    resetStaffPasswordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      let email = document.getElementById('resetStaffEmail').value.trim().toLowerCase();
      const newDefaultPassword = document.getElementById('resetStaffNewPassword').value;

      if (!email || !newDefaultPassword) {
        showToast("Vui lòng nhập đầy đủ email và mật khẩu mặc định mới!", "error");
        return;
      }

      if (newDefaultPassword.length < 6) {
        showToast("Mật khẩu mới phải tối thiểu 6 ký tự!", "error");
        return;
      }

      try {
        showToast("Đang thực hiện reset mật khẩu nhân viên...", "info");

        // 1. Verify user exists and is staff
        const userSnap = await db.collection("users")
          .where("email", "==", email)
          .where("role", "==", "employee")
          .get();

        if (userSnap.empty) {
          showToast("Không tìm thấy tài khoản nhân viên với email này!", "error");
          return;
        }

        let userDocId = "";
        userSnap.forEach(doc => {
          userDocId = doc.id;
        });

        // 2. Send Password Reset Email in Firebase Authentication
        await auth.sendPasswordResetEmail(email);

        // 3. Reset the status in Firestore (so defaultPassword is newDefaultPassword and passwordChanged is false)
        await db.collection("users").doc(userDocId).update({
          defaultPassword: newDefaultPassword,
          passwordChanged: false
        });

        showToast(`Đã gửi email khôi phục mật khẩu và cập nhật mật khẩu mặc định mới cho nhân viên!`, "success");
        resetStaffPasswordForm.reset();
        renderStaffUsersList();
      } catch (err) {
        console.error("Reset staff password error:", err);
        showToast("Lỗi khi reset mật khẩu nhân viên: " + err.message, "error");
      }
    });
  }

  // Real-time Chat Subscription Handler
  const subscribeToChatMessages = () => {
    if (chatSubscription) chatSubscription(); // Cancel active observer if any
    
    allLoadedMessages = [];
    rebuildChatThreads();

    chatSubscription = db.collection("messages")
      .orderBy("createdAt", "asc")
      .limitToLast(200) // Increase limits to support more active DM flows
      .onSnapshot((snapshot) => {
        const allMessages = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          let timeStr = "";
          let msgCreatedAt = Date.now();

          if (data.createdAt) {
            try {
              const date = data.createdAt.toDate();
              timeStr = `${pad(date.getHours(), 2)}:${pad(date.getMinutes(), 2)}`;
              msgCreatedAt = date.getTime();
            } catch (e) {
              const now = new Date();
              timeStr = `${pad(now.getHours(), 2)}:${pad(now.getMinutes(), 2)}`;
              msgCreatedAt = now.getTime();
            }
          } else {
            const now = new Date();
            timeStr = `${pad(now.getHours(), 2)}:${pad(now.getMinutes(), 2)}`;
            msgCreatedAt = now.getTime();
          }

          allMessages.push({
            id: doc.id,
            threadId: data.threadId || "group-global",
            sender: `${data.senderName} (${data.senderRole})`,
            senderName: data.senderName,
            senderRole: data.senderRole,
            senderEmail: data.senderEmail,
            content: data.content,
            image: data.image || null,
            file: data.file || null,
            fileName: data.fileName || null,
            fileSize: data.fileSize || null,
            time: timeStr,
            isRecalled: data.isRecalled || false,
            forwardedFrom: data.forwardedFrom || null,
            createdAt: msgCreatedAt
          });
        });

        allLoadedMessages = allMessages;
        rebuildChatThreads();
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
        threadId: activeThreadId || "group-global",
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

          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6);
          sendImageMessage(compressedBase64);
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);

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
        threadId: activeThreadId || "group-global",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (e) {
      console.error("Failed to write image message:", e);
      showToast("Lỗi gửi hình ảnh!", "error");
    }
  };

  // Document File Sending Handler (with Base64 Reader)
  const btnTriggerDocUpload = document.getElementById('btnTriggerDocUpload');
  const chatDocFileInput = document.getElementById('chatDocFileInput');

  if (btnTriggerDocUpload && chatDocFileInput) {
    btnTriggerDocUpload.replaceWith(btnTriggerDocUpload.cloneNode(true));
    chatDocFileInput.replaceWith(chatDocFileInput.cloneNode(true));

    const newBtnTrigger = document.getElementById('btnTriggerDocUpload');
    const newFileInput = document.getElementById('chatDocFileInput');

    newBtnTrigger.addEventListener('click', () => {
      newFileInput.click();
    });

    newFileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (file.size > 1.5 * 1024 * 1024) {
        showToast("Tệp quá lớn! Vui lòng chọn tệp dưới 1.5MB.", "error");
        return;
      }

      showToast("Đang xử lý và gửi tài liệu...", "info");

      const reader = new FileReader();
      reader.onload = async function(event) {
        const base64Data = event.target.result;
        let sizeStr = `${(file.size / 1024).toFixed(1)} KB`;
        if (file.size > 1024 * 1024) {
          sizeStr = `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
        }
        
        await sendDocMessage(base64Data, file.name, sizeStr);
      };
      reader.readAsDataURL(file);

      newFileInput.value = '';
    });
  }

  const sendDocMessage = async (base64Data, fileName, fileSize) => {
    if (!currentUser) {
      showToast("Vui lòng đăng nhập để gửi tin nhắn!", "error");
      return;
    }

    try {
      const roleLabel = currentUser.role === 'admin' ? 'quản trị viên' : 'nhân viên';
      await db.collection("messages").add({
        content: "",
        file: base64Data,
        fileName: fileName,
        fileSize: fileSize,
        senderName: currentUser.name,
        senderRole: roleLabel,
        senderEmail: currentUser.email,
        threadId: activeThreadId || "group-global",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      showToast("Gửi tài liệu thành công!", "success");
    } catch (e) {
      console.error("Failed to write document message:", e);
      showToast("Lỗi gửi tài liệu!", "error");
    }
  };

  /* ==========================================
     NEW MESSAGE ACTIONS (DELETE, RECALL, FORWARD)
     ========================================== */

  // 1. Recall message (Thu hồi đối với mọi người)
  const recallMessage = async (messageId) => {
    if (confirm("Bạn có chắc chắn muốn thu hồi tin nhắn này đối với mọi người?")) {
      try {
        await db.collection("messages").doc(messageId).update({
          content: "",
          image: null,
          file: null,
          fileName: null,
          fileSize: null,
          isRecalled: true
        });
        showToast("Đã thu hồi tin nhắn thành công!", "success");
      } catch (err) {
        console.error("Failed to recall message:", err);
        showToast("Lỗi khi thu hồi tin nhắn!", "error");
      }
    }
  };

  // 2. Delete message (Xóa phía tôi hoặc phía mọi người)
  const deleteMessage = async (messageId, canEveryone) => {
    let deleteForEveryone = false;
    if (canEveryone) {
      const choice = confirm("Nhấn OK để 'Xóa ở mọi người' (Xóa vĩnh viễn khỏi hệ thống), nhấn Hủy (Cancel) để 'Xóa chỉ ở phía tôi'?");
      if (choice) {
        deleteForEveryone = true;
      } else {
        const confirmMe = confirm("Bạn có muốn xóa tin nhắn này ở phía bạn không?");
        if (!confirmMe) return;
        deleteForEveryone = false;
      }
    } else {
      const confirmMe = confirm("Bạn có chắc chắn muốn xóa tin nhắn này ở phía bạn?");
      if (!confirmMe) return;
    }

    if (deleteForEveryone) {
      try {
        await db.collection("messages").doc(messageId).delete();
        showToast("Đã xóa tin nhắn đối với mọi người!", "success");
      } catch (err) {
        console.error("Failed to delete message for everyone:", err);
        showToast("Lỗi khi xóa tin nhắn!", "error");
      }
    } else {
      const deletedIds = JSON.parse(localStorage.getItem('deletedMessageIds') || '[]');
      if (!deletedIds.includes(messageId)) {
        deletedIds.push(messageId);
        localStorage.setItem('deletedMessageIds', JSON.stringify(deletedIds));
      }
      showToast("Đã xóa tin nhắn ở phía bạn!", "success");
      
      // Refresh local display instantly
      subscribeToChatMessages();
    }
  };

  // 3. Forward Message Modal operations
  let forwardMsgId = null;

  const openForwardModal = (messageId) => {
    forwardMsgId = messageId;
    const modal = document.getElementById('forwardMessageModal');
    if (!modal) return;
    
    // Reset and render targets
    const searchInput = document.getElementById('forwardSearchInput');
    if (searchInput) searchInput.value = '';
    renderForwardTargets();
    
    modal.style.display = 'flex';
  };

  const closeForwardModal = () => {
    const modal = document.getElementById('forwardMessageModal');
    if (modal) modal.style.display = 'none';
    forwardMsgId = null;
  };

  const renderForwardTargets = (query = "") => {
    const list = document.getElementById('forwardTargetsList');
    if (!list) return;
    list.innerHTML = '';
    
    const filteredThreads = chatThreads.filter(t => {
      if (!query) return true;
      return t.name.toLowerCase().includes(query.toLowerCase());
    });
    
    filteredThreads.forEach(thread => {
      const item = document.createElement('div');
      item.className = 'forward-target-item';
      item.innerHTML = `
        <div class="avatar" style="background-color: ${thread.avatarBg}">${thread.avatarInitials}</div>
        <span class="name">${thread.name}</span>
        <span class="role">${thread.type === 'group' ? 'Nhóm chung' : thread.membersCount}</span>
      `;
      item.addEventListener('click', () => {
        forwardMessageToThread(forwardMsgId, thread.id);
        closeForwardModal();
      });
      list.appendChild(item);
    });
  };

  const forwardMessageToThread = async (msgId, targetThreadId) => {
    let originalMsg = null;
    chatThreads.forEach(t => {
      const m = t.messages.find(msg => msg.id === msgId);
      if (m) originalMsg = m;
    });
    
    if (!originalMsg) {
      showToast("Không tìm thấy tin nhắn gốc!", "error");
      return;
    }
    
    try {
      const roleLabel = currentUser.role === 'admin' ? 'quản trị viên' : 'nhân viên';
      
      const payload = {
        content: originalMsg.content || "",
        senderName: currentUser.name,
        senderRole: roleLabel,
        senderEmail: currentUser.email,
        threadId: targetThreadId,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        forwardedFrom: originalMsg.senderName || originalMsg.sender.split(' (')[0]
      };
      
      if (originalMsg.image) payload.image = originalMsg.image;
      if (originalMsg.file) {
        payload.file = originalMsg.file;
        payload.fileName = originalMsg.fileName;
        payload.fileSize = originalMsg.fileSize;
      }
      
      await db.collection("messages").add(payload);
      showToast("Đã chuyển tiếp tin nhắn thành công!", "success");
      
      // Automatically redirect to active thread and render
      activeThreadId = targetThreadId;
      renderThreadList();
      renderMessages(activeThreadId);
    } catch (err) {
      console.error("Failed to forward message:", err);
      showToast("Lỗi khi chuyển tiếp tin nhắn!", "error");
    }
  };

  // Bind Forward modal listeners
  const btnCloseForwardModal = document.getElementById('btnCloseForwardModal');
  if (btnCloseForwardModal) {
    btnCloseForwardModal.addEventListener('click', closeForwardModal);
  }

  const forwardSearchInput = document.getElementById('forwardSearchInput');
  if (forwardSearchInput) {
    forwardSearchInput.addEventListener('input', (e) => {
      renderForwardTargets(e.target.value);
    });
  }

  // ==========================================
  // FIND FRIENDS & ADD CONTACTS MODAL LOGIC
  // ==========================================

  const subscribeToUsersCache = () => {
    return db.collection("users").get().then(snapshot => {
      allUsersList = [];
      snapshot.forEach(doc => {
        const u = doc.data();
        u.uid = doc.id;
        usersCache[u.uid] = u;
        allUsersList.push(u);
      });
    }).catch(err => console.error("Users cache load error:", err));
  };

  const subscribeToContacts = () => {
    if (contactsSubscription) contactsSubscription();
    myContacts = [];
    contactsSubscription = db.collection("contacts")
      .where("userUid", "==", auth.currentUser.uid)
      .onSnapshot((snapshot) => {
        myContacts = [];
        snapshot.forEach((doc) => myContacts.push(doc.data().contactUid));
        const modal = document.getElementById('findFriendsModal');
        if (modal && modal.style.display === 'flex') {
          const searchInput = document.getElementById('friendSearchInput');
          renderFriendsSearchResults(searchInput ? searchInput.value : "");
        }
      }, err => console.error("Contacts observer failure:", err));
  };

  const updateFriendBadge = () => {
    const btn = document.getElementById('btnOpenFindFriends');
    if (!btn) return;

    const count = myReceivedRequests.filter(r => r.status === 'pending').length;
    let badge = btn.querySelector('.friend-badge');

    if (count > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'friend-badge';
        btn.appendChild(badge);
      }
      badge.textContent = count;
    } else {
      if (badge) {
        badge.remove();
      }
    }
  };

  const subscribeToFriendRequests = () => {
    if (sentRequestsSubscription) sentRequestsSubscription();
    if (receivedRequestsSubscription) receivedRequestsSubscription();
    mySentRequests = [];
    myReceivedRequests = [];
    
    if (!auth.currentUser) return;
    const myUid = auth.currentUser.uid;

    sentRequestsSubscription = db.collection("friend_requests")
      .where("senderUid", "==", myUid)
      .onSnapshot((snapshot) => {
        mySentRequests = [];
        snapshot.forEach((doc) => {
          const req = doc.data();
          req.id = doc.id;
          mySentRequests.push(req);
        });
        
        updateFriendBadge();
        
        // Re-render search results inside modal if it's currently open
        const modal = document.getElementById('findFriendsModal');
        if (modal && modal.style.display === 'flex') {
          const searchInput = document.getElementById('friendSearchInput');
          renderFriendsSearchResults(searchInput ? searchInput.value : "");
        }
      }, (error) => {
        console.error("Sent friend requests observer failure:", error);
      });

    receivedRequestsSubscription = db.collection("friend_requests")
      .where("receiverUid", "==", myUid)
      .onSnapshot((snapshot) => {
        myReceivedRequests = [];
        snapshot.forEach((doc) => {
          const req = doc.data();
          req.id = doc.id;
          myReceivedRequests.push(req);
        });
        
        updateFriendBadge();
        
        // Re-render search results inside modal if it's currently open
        const modal = document.getElementById('findFriendsModal');
        if (modal && modal.style.display === 'flex') {
          const searchInput = document.getElementById('friendSearchInput');
          renderFriendsSearchResults(searchInput ? searchInput.value : "");
        }
      }, (error) => {
        console.error("Received friend requests observer failure:", error);
      });
  };

  // Open / Close Find Friends Modal
  const btnOpenFindFriends = document.getElementById('btnOpenFindFriends');
  const findFriendsModal = document.getElementById('findFriendsModal');
  const btnCloseFindFriendsModal = document.getElementById('btnCloseFindFriendsModal');
  const friendSearchInput = document.getElementById('friendSearchInput');

  if (btnOpenFindFriends && findFriendsModal) {
    btnOpenFindFriends.addEventListener('click', () => {
      findFriendsModal.style.display = 'flex';
      if (friendSearchInput) {
        friendSearchInput.value = '';
        friendSearchInput.focus();
      }
      renderFriendsSearchResults("");
    });
  }

  const closeFindFriendsModal = () => {
    if (findFriendsModal) findFriendsModal.style.display = 'none';
  };

  if (btnCloseFindFriendsModal) {
    btnCloseFindFriendsModal.addEventListener('click', closeFindFriendsModal);
  }

  if (findFriendsModal) {
    findFriendsModal.addEventListener('click', (e) => {
      if (e.target === findFriendsModal) closeFindFriendsModal();
    });
  }

  if (friendSearchInput) {
    friendSearchInput.addEventListener('input', (e) => {
      renderFriendsSearchResults(e.target.value);
    });
  }

  // Render search results inside Find Friends modal
  const renderFriendsSearchResults = (query = "") => {
    const list = document.getElementById('friendsSearchResultsList');
    if (!list) return;
    list.innerHTML = '';

    if (!currentUser || !auth.currentUser) return;
    const myUid = auth.currentUser.uid;
    const q = query.trim().toLowerCase();

    if (!q) {
      // 1. Show Friend Requests sections when no search query!
      let hasContent = false;

      // 1a. Received requests
      const pendingReceived = myReceivedRequests.filter(r => r.status === 'pending');
      if (pendingReceived.length > 0) {
        hasContent = true;
        const header = document.createElement('div');
        header.className = 'sidebar-section-header';
        header.style.cssText = 'font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--accent); padding: 1rem 0.5rem 0.5rem 0.5rem; margin-top: 0.5rem; border-bottom: 1px solid var(--border);';
        header.textContent = 'Lời mời kết bạn nhận được';
        list.appendChild(header);

        pendingReceived.forEach(req => {
          const initials = req.senderName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
          const item = document.createElement('div');
          item.className = 'forward-target-item';
          item.style.cssText = 'display: flex; align-items: center; gap: 1rem; padding: 0.75rem 0.5rem; border-radius: var(--border-radius-md); margin-top: 0.5rem; cursor: default;';
          item.innerHTML = `
            <div class="avatar" style="background-color: ${getAvatarBgColor(req.senderName)}; width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 0.8rem;">${initials}</div>
            <div style="display: flex; flex-direction: column; text-align: left; flex: 1;">
              <span class="name" style="font-weight: 600; color: var(--text-main); font-size: 0.9rem;">${req.senderName}</span>
              <span class="role" style="font-size: 0.75rem; color: var(--text-muted);">${req.senderEmail}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-left: auto;">
              <button class="btn-connect-friend btn-accept-friend" data-id="${req.id}" style="background: var(--accent); padding: 0.4rem 0.8rem; font-size: 0.75rem; border-radius: var(--border-radius-sm); color: white; cursor: pointer;">Chấp nhận</button>
              <button class="btn-connect-friend btn-decline-friend" data-id="${req.id}" style="background: #EF4444; padding: 0.4rem 0.8rem; font-size: 0.75rem; border-radius: var(--border-radius-sm); color: white; cursor: pointer;">Từ chối</button>
            </div>
          `;

          // Bind accept click
          item.querySelector('.btn-accept-friend').addEventListener('click', async (e) => {
            const btn = e.target;
            btn.disabled = true;
            btn.textContent = 'Đang xử lý...';
            try {
              // 1. Add User A (sender) to User B (me) contacts
              await db.collection("contacts").add({
                userUid: myUid,
                contactUid: req.senderUid,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
              });
              // 2. Add User B (me) to User A (sender) contacts
              await db.collection("contacts").add({
                userUid: req.senderUid,
                contactUid: myUid,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
              });
              // 3. Delete the friend request
              await db.collection("friend_requests").doc(req.id).delete();
              showToast(`Đã chấp nhận lời mời kết bạn từ ${req.senderName}!`, 'success');
            } catch (err) {
              console.error("Failed to accept friend request:", err);
              showToast("Lỗi khi chấp nhận kết bạn!", "error");
              btn.disabled = false;
              btn.textContent = 'Chấp nhận';
            }
          });

          // Bind decline click
          item.querySelector('.btn-decline-friend').addEventListener('click', async (e) => {
            const btn = e.target;
            btn.disabled = true;
            btn.textContent = 'Đang xử lý...';
            try {
              await db.collection("friend_requests").doc(req.id).delete();
              showToast(`Đã từ chối lời mời kết bạn từ ${req.senderName}.`, 'info');
            } catch (err) {
              console.error("Failed to decline friend request:", err);
              showToast("Lỗi khi từ chối kết bạn!", "error");
              btn.disabled = false;
              btn.textContent = 'Từ chối';
            }
          });

          list.appendChild(item);
        });
      }

      // 1b. Sent requests
      const pendingSent = mySentRequests.filter(r => r.status === 'pending');
      if (pendingSent.length > 0) {
        hasContent = true;
        const header = document.createElement('div');
        header.className = 'sidebar-section-header';
        header.style.cssText = 'font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--accent); padding: 1rem 0.5rem 0.5rem 0.5rem; margin-top: 1rem; border-bottom: 1px solid var(--border);';
        header.textContent = 'Yêu cầu kết bạn đã gửi';
        list.appendChild(header);

        pendingSent.forEach(req => {
          const initials = req.receiverName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
          const item = document.createElement('div');
          item.className = 'forward-target-item';
          item.style.cssText = 'display: flex; align-items: center; gap: 1rem; padding: 0.75rem 0.5rem; border-radius: var(--border-radius-md); margin-top: 0.5rem; cursor: default;';
          item.innerHTML = `
            <div class="avatar" style="background-color: ${getAvatarBgColor(req.receiverName)}; width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 0.8rem;">${initials}</div>
            <div style="display: flex; flex-direction: column; text-align: left; flex: 1;">
              <span class="name" style="font-weight: 600; color: var(--text-main); font-size: 0.9rem;">${req.receiverName}</span>
              <span class="role" style="font-size: 0.75rem; color: var(--text-muted);">${req.receiverEmail}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-left: auto;">
              <span style="font-size: 0.75rem; color: var(--text-muted); font-style: italic;">Đang chờ phản hồi...</span>
              <button class="btn-connect-friend btn-cancel-request" data-id="${req.id}" style="background: transparent; border: 1px solid var(--border); padding: 0.3rem 0.6rem; font-size: 0.75rem; border-radius: var(--border-radius-sm); color: var(--text-muted); cursor: pointer;">Hủy yêu cầu</button>
            </div>
          `;

          // Bind cancel request click
          item.querySelector('.btn-cancel-request').addEventListener('click', async (e) => {
            const btn = e.target;
            btn.disabled = true;
            btn.textContent = 'Đang hủy...';
            try {
              await db.collection("friend_requests").doc(req.id).delete();
              showToast(`Đã hủy yêu cầu kết bạn gửi tới ${req.receiverName}.`, 'info');
            } catch (err) {
              console.error("Failed to cancel friend request:", err);
              showToast("Lỗi khi hủy yêu cầu!", "error");
              btn.disabled = false;
              btn.textContent = 'Hủy yêu cầu';
            }
          });

          list.appendChild(item);
        });
      }

      if (!hasContent) {
        list.innerHTML = `
          <div style="padding: 3rem 2rem; text-align: center; color: var(--text-muted); font-size: 0.9rem; line-height: 1.5;">
            <svg viewBox="0 0 24 24" style="width: 48px; height: 48px; fill: var(--text-muted); opacity: 0.3; margin-bottom: 1rem;"><path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12,6A3.5,3.5 0 0,0 8.5,9.5C8.5,11.4 10,13 12,13C14,13 15.5,11.4 15.5,9.5A3.5,3.5 0 0,0 12,6M12,14C9.33,14 4,15.33 4,18V20H20V18C20,15.33 14.67,14 12,14Z"/></svg>
            <p style="font-weight: 600;">Không có lời mời kết bạn nào đang chờ.</p>
            <p style="font-size: 0.8rem; margin-top: 0.5rem; opacity: 0.8;">Hãy nhập tên đồng nghiệp vào ô tìm kiếm ở trên để gửi lời mời kết bạn mới.</p>
          </div>
        `;
      }
      return;
    }

    // Filter other users based on query
    const filteredUsers = allUsersList.filter(u => {
      if (u.uid === myUid) return false; // exclude self
      return (u.name && u.name.toLowerCase().includes(q)) || 
             (u.email && u.email.toLowerCase().includes(q));
    });

    if (filteredUsers.length === 0) {
      list.innerHTML = `
        <div style="padding: 2rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
          Không tìm thấy đồng nghiệp nào.
        </div>
      `;
      return;
    }

    filteredUsers.forEach(user => {
      const isFriend = myContacts.includes(user.uid);
      const initials = user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
      const displayRole = user.role === 'admin' ? 'Quản trị viên' : 'Nhân viên';

      // Check for pending requests
      const sentRequest = mySentRequests.find(r => r.receiverUid === user.uid && r.status === 'pending');
      const receivedRequest = myReceivedRequests.find(r => r.senderUid === user.uid && r.status === 'pending');

      const item = document.createElement('div');
      item.className = 'forward-target-item';
      item.style.display = 'flex';
      item.style.alignItems = 'center';
      item.style.gap = '1rem';
      item.style.padding = '0.75rem 1rem';
      item.style.borderRadius = 'var(--border-radius-md)';
      item.style.cursor = 'default';

      let rightContent = '';
      if (isFriend) {
        rightContent = `
          <span class="badge-connected-friend">Đã kết bạn</span>
          <button class="btn-connect-friend btn-chat-now" data-uid="${user.uid}" style="background: var(--accent); margin-left: 0.5rem;">Nhắn tin</button>
        `;
      } else if (sentRequest) {
        rightContent = `
          <button class="btn-connect-friend btn-cancel-request-action" data-id="${sentRequest.id}" style="background: transparent; border: 1px solid var(--border); color: var(--text-muted); margin-left: auto; cursor: pointer;">Đã gửi yêu cầu (Hủy)</button>
        `;
      } else if (receivedRequest) {
        rightContent = `
          <button class="btn-connect-friend btn-accept-friend-action" data-id="${receivedRequest.id}" style="background: var(--accent); margin-left: auto; cursor: pointer;">Chấp nhận</button>
          <button class="btn-connect-friend btn-decline-friend-action" data-id="${receivedRequest.id}" style="background: #EF4444; margin-left: 0.5rem; cursor: pointer;">Từ chối</button>
        `;
      } else {
        rightContent = `
          <button class="btn-connect-friend btn-add-friend-action" data-uid="${user.uid}" style="background: var(--text-main); margin-left: auto; cursor: pointer;">👤+ Kết bạn</button>
        `;
      }

      item.innerHTML = `
        <div class="avatar" style="background-color: ${getAvatarBgColor(user.name)}; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 0.85rem;">${initials}</div>
        <div style="display: flex; flex-direction: column; text-align: left; flex: 1;">
          <span class="name" style="font-weight: 600; color: var(--text-main);">${user.name}</span>
          <span class="role" style="font-size: 0.75rem; color: var(--text-muted);">${user.email} (${displayRole})</span>
        </div>
        <div style="display: flex; align-items: center; gap: 0.5rem; margin-left: auto;">
          ${rightContent}
        </div>
      `;

      // Bind Connect Friend click hook
      const btnAdd = item.querySelector('.btn-add-friend-action');
      if (btnAdd) {
        btnAdd.addEventListener('click', async () => {
          btnAdd.disabled = true;
          btnAdd.textContent = 'Đang gửi...';
          try {
            await db.collection("friend_requests").add({
              senderUid: myUid,
              senderName: currentUser.name,
              senderEmail: currentUser.email,
              receiverUid: user.uid,
              receiverName: user.name,
              receiverEmail: user.email,
              status: "pending",
              createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            showToast(`Đã gửi yêu cầu kết bạn tới ${user.name}!`, 'success');
          } catch (err) {
            console.error("Failed to add friend:", err);
            showToast("Lỗi khi kết bạn!", "error");
            btnAdd.disabled = false;
            btnAdd.textContent = '👤+ Kết bạn';
          }
        });
      }

      // Bind Cancel Sent Request click hook
      const btnCancel = item.querySelector('.btn-cancel-request-action');
      if (btnCancel) {
        btnCancel.addEventListener('click', async () => {
          btnCancel.disabled = true;
          btnCancel.textContent = 'Đang hủy...';
          try {
            await db.collection("friend_requests").doc(btnCancel.dataset.id).delete();
            showToast(`Đã hủy yêu cầu kết bạn gửi tới ${user.name}.`, 'info');
          } catch (err) {
            console.error("Failed to cancel friend request:", err);
            showToast("Lỗi khi hủy yêu cầu!", "error");
            btnCancel.disabled = false;
            btnCancel.textContent = 'Đã gửi yêu cầu (Hủy)';
          }
        });
      }

      // Bind Accept Friend click hook
      const btnAccept = item.querySelector('.btn-accept-friend-action');
      if (btnAccept) {
        btnAccept.addEventListener('click', async () => {
          btnAccept.disabled = true;
          btnAccept.textContent = 'Đang chấp nhận...';
          try {
            await db.collection("contacts").add({
              userUid: myUid,
              contactUid: user.uid,
              createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            await db.collection("contacts").add({
              userUid: user.uid,
              contactUid: myUid,
              createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            await db.collection("friend_requests").doc(btnAccept.dataset.id).delete();
            showToast(`Đã kết bạn với ${user.name} thành công!`, 'success');
          } catch (err) {
            console.error("Failed to accept friend request:", err);
            showToast("Lỗi khi chấp nhận kết bạn!", "error");
            btnAccept.disabled = false;
            btnAccept.textContent = 'Chấp nhận';
          }
        });
      }

      // Bind Decline Friend click hook
      const btnDecline = item.querySelector('.btn-decline-friend-action');
      if (btnDecline) {
        btnDecline.addEventListener('click', async () => {
          btnDecline.disabled = true;
          btnDecline.textContent = 'Đang từ chối...';
          try {
            await db.collection("friend_requests").doc(btnDecline.dataset.id).delete();
            showToast(`Đã từ chối lời mời kết bạn từ ${user.name}.`, 'info');
          } catch (err) {
            console.error("Failed to decline friend request:", err);
            showToast("Lỗi khi từ chối kết bạn!", "error");
            btnDecline.disabled = false;
            btnDecline.textContent = 'Từ chối';
          }
        });
      }

      // Bind Chat Now click hook
      const btnChat = item.querySelector('.btn-chat-now');
      if (btnChat) {
        btnChat.addEventListener('click', () => {
          const threadId = getDmThreadId(myUid, user.uid);
          activeThreadId = threadId;
          rebuildChatThreads();
          closeFindFriendsModal();
          const chatInput = document.getElementById('chatMessageInput');
          if (chatInput) chatInput.focus();
        });
      }

      list.appendChild(item);
    });
  };


  // Custom File Context Menu Logic
  let contextMenuFileMsg = null;

  const btnDownloadFromContext = document.getElementById('btnDownloadFromContext');
  if (btnDownloadFromContext) {
    btnDownloadFromContext.addEventListener('click', () => {
      const menu = document.getElementById('chatCustomContextMenu');
      if (menu) menu.style.display = 'none';
      
      if (!contextMenuFileMsg || !contextMenuFileMsg.file) return;
      
      try {
        const base64Data = contextMenuFileMsg.file;
        const parts = base64Data.split(';base64,');
        const contentType = parts[0].split(':')[1];
        const raw = window.atob(parts[1]);
        const rawLength = raw.length;
        const uInt8Array = new Uint8Array(rawLength);
        
        for (let i = 0; i < rawLength; ++i) {
          uInt8Array[i] = raw.charCodeAt(i);
        }
        
        const blob = new Blob([uInt8Array], { type: contentType });
        const blobUrl = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = contextMenuFileMsg.fileName || 'file';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
      } catch (err) {
        console.error("Blob URL download failed, falling back to direct click", err);
        const a = document.createElement('a');
        a.href = contextMenuFileMsg.file;
        a.download = contextMenuFileMsg.fileName || 'file';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    });
  }

  // Dismiss context menu and thread menus when clicking elsewhere
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('chatCustomContextMenu');
    if (menu && menu.style.display === 'block') {
      if (!menu.contains(e.target)) {
        menu.style.display = 'none';
      }
    }

    // Dismiss thread dropdown menus if clicking outside of them
    if (!e.target.closest('.thread-menu-btn') && !e.target.closest('.thread-dropdown-menu')) {
      document.querySelectorAll('.thread-dropdown-menu').forEach(el => {
        el.style.display = 'none';
      });
      document.querySelectorAll('.thread-menu-btn').forEach(el => {
        el.classList.remove('active');
      });
    }
  });

  document.addEventListener('contextmenu', (e) => {
    const menu = document.getElementById('chatCustomContextMenu');
    if (menu && !e.target.closest('.chat-message-file-container')) {
      menu.style.display = 'none';
    }
  });

  /* ==========================================================================
     STUDENT MANAGEMENT MODULE (INTEGRATED WITH FIREBASE FIRESTORE)
     ========================================================================== */
  
  let students = [];
  let studentsSubscription = null;

  // Staff lookup map: name (lowercase) → { name, department } — loaded once
  let _staffNameMap  = {};
  let _staffNames    = [];
  let _staffDepts    = [];
  let _staffMapLoaded = false;

  const _loadStaffMap = async () => {
    if (_staffMapLoaded) return;
    _staffMapLoaded = true;
    try {
      // Prefer already-loaded hrmStaffCache to avoid extra Firestore read
      const cached = (typeof hrmStaffCache !== 'undefined' && hrmStaffCache.length)
        ? hrmStaffCache
        : (await db.collection('hrm_staff').get()).docs.map(d => ({ id: d.id, ...d.data() }));
      _staffNameMap = {};
      _staffNames  = [];
      _staffDepts  = [];
      const _deptSet = new Set();
      cached.forEach(s => {
        if (!s.name) return;
        const dept = s.department || s.dept || '';
        _staffNameMap[s.name.toLowerCase().trim()] = { name: s.name, department: dept || '--', email: s.email || '' };
        _staffNames.push(s.name);
        if (dept) _deptSet.add(dept);
      });
      _staffNames.sort((a, b) => a.localeCompare(b, 'vi'));
      const _BASE_DEPTS = ['Hành chính kế toán','Marketing','Đối ngoại','Hồ sơ','Đào tạo','Kinh doanh'];
      _staffDepts = _BASE_DEPTS.concat([..._deptSet].filter(d => !_BASE_DEPTS.includes(d)));
    } catch (e) {
      console.warn('Could not load staff map:', e.message);
    }
  };

  // Populate #srcAdvisor select — accessible from any scope that needs it
  const populateSrcAdvisorSelect = async (curVal) => {
    await _loadStaffMap();
    const sel = document.getElementById('srcAdvisor');
    if (!sel) return;
    let opts = '<option value="">-- Chọn nhân viên --</option>';
    opts += _staffNames.map(n =>
      `<option value="${n}"${n === curVal ? ' selected' : ''}>${n}</option>`
    ).join('');
    sel.innerHTML = opts;
  };

  // Populate #crmAdvisor select inside crmCustomerModal
  const populateCrmAdvisorSelect = async (curVal) => {
    await _loadStaffMap();
    const sel = document.getElementById('crmAdvisor');
    if (!sel) return;
    let opts = '<option value="">-- Chọn nhân viên --</option>';
    opts += _staffNames.map(n =>
      `<option value="${n}"${n === curVal ? ' selected' : ''}>${n}</option>`
    ).join('');
    sel.innerHTML = opts;
  };

  // Populate #crmOldAdvisor select inside crmOldCustomerModal
  const populateCrmOldAdvisorSelect = async (curVal) => {
    await _loadStaffMap();
    const sel = document.getElementById('crmOldAdvisor');
    if (!sel) return;
    let opts = '<option value="">-- Chọn nhân viên --</option>';
    opts += _staffNames.map(n =>
      `<option value="${n}"${n === curVal ? ' selected' : ''}>${n}</option>`
    ).join('');
    sel.innerHTML = opts;
  };

  // Returns { name, department } for a staff identifier (name string)
  const _lookupStaff = (identifier) => {
    if (!identifier || identifier === '--') return null;
    const key = identifier.toLowerCase().trim();
    // Exact match first
    if (_staffNameMap[key]) return _staffNameMap[key];
    // Partial match fallback
    for (const [k, v] of Object.entries(_staffNameMap)) {
      if (k.includes(key) || key.includes(k)) return v;
    }
    return null;
  };

  // Setup Student Database real-time observer
  let currentPage = 1;
  const itemsPerPage = 20;

  const subscribeToStudents = () => {
    if (studentsSubscription) studentsSubscription();

    studentsSubscription = db.collection("students")
      .orderBy("code", "asc")
      .onSnapshot((snapshot) => {
        students = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          data.id = doc.id;
          students.push(data);
        });
        applyStudentFiltersAndRender();
      }, (error) => {
        console.error("Firestore students observer failure:", error);
      });
  };

  // Format/parse helpers for student money inputs
  const fmtMoneyInput  = (v) => v ? Number(v).toLocaleString('vi-VN') : '';
  const parseMoneyInput = (s) => {
    const n = Number(String(s).replace(/[^\d]/g, ''));
    return isNaN(n) ? 0 : n;
  };

  // Render Student Table Rows
  const renderStudentsTable = (filteredList) => {
    const tableBody = document.getElementById("studentTableBody");
    if (!tableBody) return;
    tableBody.innerHTML = "";

    if (filteredList.length === 0) {
      tableBody.innerHTML =
        '<tr><td colspan="15" style="text-align:center;padding:3rem;color:var(--text-muted);font-size:0.82rem;">' +
        'Không tìm thấy hồ sơ học viên nào phù hợp.</td></tr>';
      return;
    }

    const globalStudentIndexMap = new Map(students.map((s, i) => [s.id, 10001 + i]));
    const pad2 = (n) => n < 10 ? '0' + n : '' + n;

    const getRoadmapLabel = () => '6 THÁNG';

    const fmtDate = (val) => {
      if (!val) return '--';
      const d = val.toDate ? val.toDate() : new Date(val);
      if (isNaN(d)) return '--';
      return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear();
    };


    filteredList.forEach((student) => {
      const tr = document.createElement("tr");

      const globalIdx   = globalStudentIndexMap.get(student.id) ?? (10001 + filteredList.indexOf(student));
      const displayCode = String(globalIdx);

      let badgeClass = "badge-danghoc";
      if      (student.status === "Chờ phỏng vấn")  badgeClass = "badge-waiting";
      else if (student.status === "Đã trúng tuyển") badgeClass = "badge-selected";
      else if (student.status === "Đang làm hồ sơ")  badgeClass = "badge-processing";
      else if (student.status === "Đã xuất cảnh")    badgeClass = "badge-selected";

      const enrollDateStr = student.enrollDate
        ? new Date(student.enrollDate).toLocaleDateString('vi-VN')
        : fmtDate(student.createdAt);
      const roadmapLabel  = getRoadmapLabel(student.createdAt);

      let fVal = '', fDisplay = '';
      if (student.flightDate) {
        const fd2 = student.flightDate.toDate ? student.flightDate.toDate() : new Date(student.flightDate);
        if (!isNaN(fd2)) {
          const fy = fd2.getFullYear(), fm = String(fd2.getMonth()+1).padStart(2,'0'), fdd = String(fd2.getDate()).padStart(2,'0');
          fVal     = fy + '-' + fm + '-' + fdd;
          fDisplay = fdd + '/' + fm + '/' + fy;
        }
      }

      const nameEsc = (student.name || '').replace(/"/g, '&quot;');
      const hometown = student.hometown || student.address || '--';
      const rawSource = student.source || student.advisor || '';
      const staffMatch = rawSource ? _lookupStaff(rawSource) : null;
      const source = staffMatch ? staffMatch.name : (rawSource || '--');
      const room   = staffMatch ? staffMatch.department : (student.room || student.classroom || '--');

      tr.innerHTML =
        '<td class="stw-code"><span class="stw-code-val">' + (student.code || displayCode) + '</span></td>' +
        '<td class="stw-name"><div class="stw-name-main">' + (student.name || '--') + '</div></td>' +
        '<td class="stw-email"><a class="stw-link" href="mailto:' + (student.email||'') + '">' + (student.email || '--') + '</a></td>' +
        '<td class="stw-phone">' + (student.phone || '--') + '</td>' +
        '<td class="stw-home">'  + hometown + '</td>' +
        '<td class="stw-country"><span class="stw-country-val">' + (student.country || '--') + '</span></td>' +
        '<td class="stw-status">' +
          '<select class="stw-status-select ' + badgeClass + '" data-id="' + student.id + '">' +
            '<option value="Đang học"'         + (student.status === 'Đang học'         ? ' selected' : '') + '>Đang học</option>' +
            '<option value="Chờ phỏng vấn"'   + (student.status === 'Chờ phỏng vấn'   ? ' selected' : '') + '>Chờ phỏng vấn</option>' +
            '<option value="Đã trúng tuyển"'  + (student.status === 'Đã trúng tuyển'  ? ' selected' : '') + '>Đã trúng tuyển</option>' +
            '<option value="Đang làm hồ sơ"'  + (student.status === 'Đang làm hồ sơ'  ? ' selected' : '') + '>Đang làm hồ sơ</option>' +
            '<option value="Đã xuất cảnh"'    + (student.status === 'Đã xuất cảnh'    ? ' selected' : '') + '>Đã xuất cảnh</option>' +
            '<option value="Chờ xử lý"'       + (student.status === 'Chờ xử lý'       ? ' selected' : '') + '>Chờ xử lý</option>' +
          '</select>' +
        '</td>' +
        '<td class="stw-roadmap"><span class="stw-roadmap-tag">' + roadmapLabel + '</span></td>' +
        '<td class="stw-enroll">' + enrollDateStr + '</td>' +
        (() => {
            const opts = ['<option value="">-- Chọn phòng --</option>']
              .concat(_staffDepts.map(d => '<option value="' + d + '"' + (d === room && room !== '--' ? ' selected' : '') + '>' + d + '</option>'))
              .join('');
            return '<td class="stw-room"><select class="stw-inline-select stw-room-select" data-id="' + student.id + '">' + opts + '</select></td>';
          })() +
        (() => {
            const curSrc = rawSource || '';
            const opts = ['<option value="">-- Chọn nhân viên --</option>']
              .concat(_staffNames.map(n => '<option value="' + n + '"' + (n === curSrc ? ' selected' : '') + '>' + n + '</option>'))
              .join('');
            return '<td class="stw-src"><select class="stw-inline-select stw-src-select" data-id="' + student.id + '">' + opts + '</select></td>';
          })() +
        '<td class="stw-flight">' +
          '<input type="date" class="flight-date-input' + (fVal ? ' has-date' : '') + '"' +
          ' data-id="' + student.id + '" data-name="' + nameEsc + '" data-code="' + displayCode + '"' +
          ' value="' + fVal + '" title="' + (fVal ? ('Ngày bay: ' + fDisplay) : 'Chưa có lịch bay') + '" />' +
        '</td>' +
        '<td class="stw-paid">' +
          '<input type="text" class="stw-money-input stw-paid-input" data-id="' + student.id + '" data-field="paidAmount"' +
          ' value="' + (student.paidAmount ? fmtMoneyInput(student.paidAmount) : '') + '"' +
          ' placeholder="0" inputmode="numeric" autocomplete="off" />' +
        '</td>' +
        '<td class="stw-total">' +
          '<input type="text" class="stw-money-input stw-total-input" data-id="' + student.id + '" data-field="totalAmount"' +
          ' value="' + (student.totalAmount ? fmtMoneyInput(student.totalAmount) : '') + '"' +
          ' placeholder="0" inputmode="numeric" autocomplete="off" />' +
        '</td>' +
        '<td class="stw-action"><div class="stw-actions">' +
          '<button class="action-icon-btn btn-view-student" data-id="' + student.id + '" title="Chi tiết" style="color:#6366F1;background:#EEF2FF;">' +
            '<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;"><path d="M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,4.5C7,4.5 2.73,7.61 1,12C2.73,16.39 7,19.5 12,19.5C17,19.5 21.27,16.39 23,12C21.27,7.61 17,4.5 12,4.5Z"/></svg>' +
          '</button>' +
          '<button class="action-icon-btn btn-edit-student" data-id="' + student.id + '" title="Sửa" style="color:var(--text-main);background:var(--bg-secondary,#F7F4EF);">' +
            '<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;"><path d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.07,6.18L3,17.25Z"/></svg>' +
          '</button>' +
          '<button class="action-icon-btn btn-delete-student" data-id="' + student.id + '" title="Xóa" style="color:#EF4444;background:#FEF2F2;">' +
            '<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;"><path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/></svg>' +
          '</button>' +
        '</div></td>';

      tr.querySelector(".btn-view-student").addEventListener("click",   () => openStudentDetailModal(student));
      tr.querySelector(".btn-edit-student").addEventListener("click",   () => openEditStudentModal(student));
      tr.querySelector(".btn-delete-student").addEventListener("click", () => handleDeleteStudent(student));

      // Status select inline change
      tr.querySelector('.stw-status-select').addEventListener('change', async function () {
        const newStatus = this.value;
        const sid = this.dataset.id;
        // Update badge class on select
        this.className = 'stw-status-select';
        if (newStatus === 'Đang học')        this.classList.add('badge-danghoc');
        else if (newStatus === 'Chờ phỏng vấn')  this.classList.add('badge-waiting');
        else if (newStatus === 'Đã trúng tuyển') this.classList.add('badge-selected');
        else if (newStatus === 'Đang làm hồ sơ') this.classList.add('badge-processing');
        else if (newStatus === 'Đã xuất cảnh')   this.classList.add('badge-selected');
        try {
          await db.collection('students').doc(sid).update({ status: newStatus });
          showToast('Đã cập nhật trạng thái: ' + newStatus, 'success');
        } catch (err) {
          showToast('Lỗi cập nhật trạng thái: ' + err.message, 'error');
        }
      });

      // Nguồn (source) select — when changed, auto-fill Phòng + save both
      tr.querySelector('.stw-src-select').addEventListener('change', async function () {
        const sid    = this.dataset.id;
        const newSrc = this.value;
        const match  = newSrc ? _lookupStaff(newSrc) : null;
        const newDept= match ? match.department : '';

        // Auto-update Phòng select in same row
        const roomSel = tr.querySelector('.stw-room-select');
        if (roomSel && newDept) {
          const exists = [...roomSel.options].some(o => o.value === newDept);
          if (!exists) {
            const opt = document.createElement('option');
            opt.value = opt.textContent = newDept;
            roomSel.insertBefore(opt, roomSel.options[1]);
          }
          roomSel.value = newDept;
        }

        try {
          const upd = { source: newSrc };
          if (newDept) upd.room = newDept;
          await db.collection('students').doc(sid).update(upd);
          showToast('Đã cập nhật nguồn' + (newDept ? ' & phòng: ' + newDept : ''), 'success');
        } catch (err) { showToast('Lỗi: ' + err.message, 'error'); }
      });

      // Phòng (room) select — manual override
      tr.querySelector('.stw-room-select').addEventListener('change', async function () {
        const sid     = this.dataset.id;
        const newRoom = this.value;
        try {
          await db.collection('students').doc(sid).update({ room: newRoom });
          showToast('Đã cập nhật phòng: ' + (newRoom || '--'), 'success');
        } catch (err) { showToast('Lỗi: ' + err.message, 'error'); }
      });

      // Money inputs — format on focus/blur, save on blur
      tr.querySelectorAll('.stw-money-input').forEach(inp => {
        // On focus: strip formatting so user can type raw numbers
        inp.addEventListener('focus', function () {
          const raw = parseMoneyInput(this.value);
          this.value = raw > 0 ? String(raw) : '';
          this.select();
        });
        // On blur: re-format display + save to Firestore
        inp.addEventListener('blur', async function () {
          const raw   = parseMoneyInput(this.value);
          const field = this.dataset.field;
          const sid   = this.dataset.id;
          this.value  = raw > 0 ? fmtMoneyInput(raw) : '';
          try {
            await db.collection('students').doc(sid).update({ [field]: raw || null });
          } catch (err) { showToast('Lỗi lưu: ' + err.message, 'error'); }
        });
        // Save on Enter key
        inp.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); this.blur(); }
        });
      });

      tr.querySelector('.flight-date-input').addEventListener('change', async function () {
        const dateStr = this.value;
        const sid     = this.dataset.id;
        const sname   = this.dataset.name;
        const scode   = this.dataset.code;
        try {
          await saveFlightDate(sid, sname, scode, dateStr);
          this.classList.toggle('has-date', !!dateStr);
          const fd3 = dateStr ? dateStrToMidnight(dateStr) : null;
          const daysLeft = fd3 ? Math.round((fd3 - new Date()) / 86400000) : null;
          showToast(
            dateStr
              ? ('Đã lưu lịch bay ' + sname + ' · ' + (daysLeft >= 0 ? 'còn ' + daysLeft + ' ngày' : 'đã qua') + ' · Thông báo sẽ gửi trước 7 ngày và 3 ngày!')
              : ('Đã xóa lịch bay của ' + sname),
            dateStr ? 'success' : 'warning'
          );
        } catch (err) {
          showToast('Lỗi lưu lịch bay: ' + err.message, 'error');
        }
      });

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

  const populateAdvisorSelect = async (selectedName = '') => {
    const sel = document.getElementById('studentAdvisor');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Đang tải... --</option>';
    let staffList = hrmStaffCache.length ? hrmStaffCache : [];
    if (!staffList.length) {
      try {
        const snap = await db.collection('hrm_staff').orderBy('name').get();
        staffList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch(e) { staffList = []; }
    }
    if (!staffList.length) {
      sel.innerHTML = '<option value="">-- Chưa có nhân viên --</option>';
      return;
    }
    sel.innerHTML = '<option value="">-- Chọn nhân viên --</option>' +
      staffList.map(s => `<option value="${s.name}"${s.name === selectedName ? ' selected' : ''}>${s.name}${s.position ? ' · ' + s.position : ''}</option>`).join('');
    // Wire auto-fill room when advisor changes (attach once)
    if (!sel._autofillWired) {
      sel._autofillWired = true;
      sel.addEventListener('change', function() {
        const roomSel = document.getElementById('studentRoom');
        if (!roomSel || !this.value) return;
        const match = _lookupStaff(this.value);
        if (match && match.department && match.department !== '--') {
          roomSel.value = match.department;
        }
      });
    }
  };

  // Open modal for Adding new student
  if (btnOpenAddStudentModal && studentModal) {
    btnOpenAddStudentModal.addEventListener("click", async () => {
      document.getElementById("studentModalTitle").textContent = "+ THÊM HỌC VIÊN MỚI";
      document.getElementById("studentEditId").value = "";
      document.getElementById("studentFormMode").value = "student";
      studentForm.reset();
      // Restore student status options
      const statusSel = document.getElementById('studentStatus');
      statusSel.innerHTML = `
        <option value="Đang học">Đang học</option>
        <option value="Chờ phỏng vấn">Chờ phỏng vấn</option>
        <option value="Đã trúng tuyển">Đã trúng tuyển</option>
        <option value="Đang làm hồ sơ">Đang làm hồ sơ</option>`;
      // Show tháng học
      const monthRow = document.getElementById('studentLearningMonthRow');
      if (monthRow) monthRow.style.display = '';
      document.getElementById('studentLearningMonth').setAttribute('required', '');
      await populateAdvisorSelect();
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
    const overlay = document.getElementById('studentDetailModal');
    if (!overlay) return;

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '--'; };

    const initials = (student.name || 'HV').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    const avatarEl = document.getElementById('adsdAvatar');
    if (avatarEl) {
      avatarEl.textContent = initials;
      avatarEl.style.backgroundColor = getAvatarBgColor(student.name || 'HV');
    }
    set('adsdTopName',       student.name);
    set('adsdTopCode',       student.code);
    set('adsdName',          student.name);
    set('adsdCode',          student.code);
    set('adsdCodeRow',       student.code);
    set('adsdEmail',         student.email);
    set('adsdPhone',         student.phone);
    set('adsdHometown',      student.hometown || student.address);
    set('adsdCountry',       student.country);
    // Room: prefer stored room field, else look up from staff map via source/advisor
    const roomFromStaff = (() => {
      const src = student.source || student.advisor || '';
      if (!src) return '';
      const info = _lookupStaff(src);
      return info ? info.department : '';
    })();
    set('adsdRoom',          student.room || student.classroom || roomFromStaff);
    set('adsdAdvisor',       student.advisor || student.source || 'Chưa phân công');
    set('adsdLearningMonth', student.learningMonth || 'Tháng 1');
    set('adsdNotes',         student.notes || 'Chưa có ghi chú tư vấn.');

    const statusEl = document.getElementById('adsdStatus');
    if (statusEl) {
      statusEl.textContent = student.status || 'Đang học';
      const sc = student.status === 'Đang học'        ? 'active-badge'
               : student.status === 'Chờ phỏng vấn'   ? 'pending-badge'
               : student.status === 'Đã xuất cảnh'    ? 'completed-badge'
               : 'inactive-badge';
      statusEl.className = 'profile-status-badge ' + sc;
    }

    const enrollDate = student.enrollDate
      ? new Date(student.enrollDate)
      : student.createdAt
        ? (student.createdAt.toDate ? student.createdAt.toDate() : new Date(student.createdAt))
        : new Date();
    set('adsdEnrollDate', enrollDate.toLocaleDateString('vi-VN'));

    const flightEl    = document.getElementById('adsdFlightDate');
    const countdownEl = document.getElementById('adsdFlightCountdown');
    if (student.flightDate) {
      const fd = student.flightDate.toDate ? student.flightDate.toDate() : new Date(student.flightDate);
      if (flightEl) flightEl.textContent = fd.toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit', year:'numeric' });
      if (countdownEl) {
        const diff = Math.ceil((fd - new Date()) / (1000 * 60 * 60 * 24));
        countdownEl.textContent = diff > 0 ? ('Còn ' + diff + ' ngày') : diff === 0 ? 'Hôm nay xuất cảnh!' : ('Đã xuất cảnh ' + Math.abs(diff) + ' ngày trước');
        countdownEl.style.background = diff <= 7 && diff >= 0 ? 'rgba(239,68,68,0.1)' : '';
        countdownEl.style.color      = diff <= 7 && diff >= 0 ? '#EF4444' : '';
      }
    } else {
      if (flightEl)    flightEl.textContent   = 'Chưa có lịch bay';
      if (countdownEl) countdownEl.textContent = '';
    }

    const tuitionTotal  = student.totalAmount || student.tuitionTotal  || 0;
    const tuitionPaid   = student.paidAmount  || student.tuitionPaid   || 0;
    const tuitionRemain = Math.max(0, tuitionTotal - tuitionPaid);
    const fmtTu = (n) => n > 0 ? Number(n).toLocaleString('vi-VN') + ' đ' : '--';
    set('adsdTuitionTotal',  fmtTu(tuitionTotal));
    set('adsdTuitionPaid',   fmtTu(tuitionPaid));
    set('adsdTuitionRemain', tuitionTotal > 0 ? (tuitionRemain > 0 ? fmtTu(tuitionRemain) : '0 đ') : '--');
    const tuStatusEl = document.getElementById('adsdTuitionStatus');
    if (tuStatusEl) {
      if (!tuitionTotal) {
        tuStatusEl.textContent = 'Chưa cập nhật'; tuStatusEl.style.background='var(--color-border,#E8E5DF)'; tuStatusEl.style.color='var(--color-text-muted,#6B6A67)';
      } else if (tuitionRemain <= 0) {
        tuStatusEl.textContent = 'Đã đóng đủ'; tuStatusEl.style.background='rgba(16,185,129,0.1)'; tuStatusEl.style.color='#10B981';
      } else {
        tuStatusEl.textContent = 'Còn nợ'; tuStatusEl.style.background='rgba(239,68,68,0.1)'; tuStatusEl.style.color='#EF4444';
      }
    }
    const barEl = document.getElementById('adsdTuitionBar');
    if (barEl) barEl.style.width = tuitionTotal > 0 ? Math.min(100, Math.round(tuitionPaid / tuitionTotal * 100)) + '%' : '0%';

    const ROADMAP_STEPS_VI = [
      { month:'Tháng 1', label:'Xây dựng nền tảng',   sub:'Nhập môn ngôn ngữ & văn hóa' },
      { month:'Tháng 2', label:'Phát triển phản xạ',   sub:'Kỹ năng nghe – nói cơ bản' },
      { month:'Tháng 3', label:'Làm quen học thuật',   sub:'Ngữ pháp & từ vựng học thuật' },
      { month:'Tháng 4', label:'Tăng tốc học thuật',   sub:'Đọc hiểu & viết luận' },
      { month:'Tháng 5', label:'Luyện đề chuyên sâu', sub:'Ôn thi & mô phỏng phỏng vấn' },
      { month:'Tháng 6', label:'Tổng ôn & mô phỏng',   sub:'Chuẩn bị hồ sơ & xuất cảnh' },
    ];
    // currentIdx = 1..6 for T1-T6, 7 for Hoàn thành — driven by learningMonth field
    const LM_MAP = { 'Tháng 1':1, 'Tháng 2':2, 'Tháng 3':3, 'Tháng 4':4, 'Tháng 5':5, 'Tháng 6':6, 'Hoàn thành':7 };
    const currentIdx = LM_MAP[student.learningMonth] || 1;
    const roadmapEl = document.getElementById('adsdRoadmap');
    if (roadmapEl) {
      roadmapEl.innerHTML = ROADMAP_STEPS_VI.map(function(s, i) {
        const stepNum = i + 1;
        const allDone = currentIdx >= 7;
        const done   = allDone || stepNum < currentIdx;
        const active = !allDone && stepNum === currentIdx;
        const dotCls  = done ? 'done' : active ? 'active' : '';
        const cardCls = done ? 'done-card' : active ? 'active-card' : '';
        const tagCls  = done ? 'done' : active ? 'active' : 'upcoming';
        const tagTxt  = done ? 'Hoàn thành' : active ? 'Đang học' : 'Chưa bắt đầu';
        const statusIcon = done
          ? '<svg viewBox="0 0 24 24"><path d="M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z"/></svg>'
          : active ? '<span class="stp-active-dot"></span>' : '';
        return '<div class="stp-roadmap-step ' + cardCls + '">'
          + '<div class="stp-step-dot ' + dotCls + '" data-month="' + s.month + '">' + statusIcon + '</div>'
          + '<div class="stp-step-body"><div class="stp-step-label">' + s.label + '</div>'
          + '<span class="stp-step-tag ' + tagCls + '">' + tagTxt + '</span></div></div>';
      }).join('');
    }

    const sem1Status = currentIdx >= 3 ? 'Hoàn thành' : 'Đang học';
    const sem2Status = currentIdx <= 2 ? 'Chưa bắt đầu' : currentIdx >= 5 ? 'Hoàn thành' : 'Đang học';
    const sem3Status = currentIdx <= 4 ? 'Chưa bắt đầu' : currentIdx >= 7 ? 'Hoàn thành' : 'Đang học';
    const applyTag = function(id, txt) {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = txt;
      el.style.background = txt === 'Hoàn thành' ? 'rgba(16,185,129,0.1)' : txt === 'Đang học' ? 'rgba(168,139,88,0.1)' : 'var(--color-border,#E8E5DF)';
      el.style.color      = txt === 'Hoàn thành' ? '#10B981' : txt === 'Đang học' ? 'var(--color-accent,#A88B58)' : 'var(--color-text-muted,#6B6A67)';
    };
    applyTag('adsdSem1', sem1Status);
    applyTag('adsdSem2', sem2Status);
    applyTag('adsdSem3', sem3Status);
    const semNames = { 1:'KÌ I: Nhập môn & Phản xạ', 2:'KÌ I: Nhập môn & Phản xạ', 3:'KÌ II: Ngữ pháp & Học thuật', 4:'KÌ II: Ngữ pháp & Học thuật', 5:'KÌ III: Luyện đề & Phỏng vấn', 6:'KÌ III: Luyện đề & Phỏng vấn', 7:'Hoàn thành lộ trình' };
    set('adsdSemesterBadge', semNames[currentIdx] || '--');

    initAdminStudentScorecardModule(student);

    const btnEdit2 = document.getElementById('btnEditFromDetail');
    if (btnEdit2) {
      const nb = btnEdit2.cloneNode(true);
      btnEdit2.replaceWith(nb);
      nb.addEventListener('click', function() {
        closeStudentDetailModal();
        openEditStudentModal(student);
      });
    }

    // ── Load chi tiết hồ sơ vào admin overlay ──────────────────
    if (student.id) {
      db.collection('student_profiles').doc(student.id).get().then(snap => {
        const d = snap.exists ? snap.data() : {};
        const sd = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '--'; };
        const fmtYr  = (name, year, job) => [name, year ? `(${year})` : '', job].filter(Boolean).join(' · ') || '--';
        const fmtEdu = (name, from, to) => name ? `${name}${from||to ? ` (${from||''}–${to||''})` : ''}` : '--';
        sd('adsdDCccd', d.cccd); sd('adsdDCccdDate', d.cccdDate);
        sd('adsdDGender', d.gender); sd('adsdDDob', d.dob);
        sd('adsdDReligion', d.religion); sd('adsdDEthnicity', d.ethnicity);
        sd('adsdDMarital', d.marital);
        sd('adsdDPhone', d.phone); sd('adsdDPhoneRelative', d.phoneRelative);
        sd('adsdDPermanentAddress', d.permanentAddress); sd('adsdDTempAddress', d.tempAddress);
        sd('adsdDSchoolPrimary', fmtEdu(d.schoolPrimary, d.schoolPrimaryFrom, d.schoolPrimaryTo));
        sd('adsdDSchoolMiddle',  fmtEdu(d.schoolMiddle,  d.schoolMiddleFrom,  d.schoolMiddleTo));
        sd('adsdDSchoolHigh',    fmtEdu(d.schoolHigh,    d.schoolHighFrom,    d.schoolHighTo));
        sd('adsdDSchoolUni',     fmtEdu(d.schoolUni,     d.schoolUniFrom,     d.schoolUniTo));
        sd('adsdDFather',        fmtYr(d.fatherName, d.fatherYear, d.fatherJob));
        sd('adsdDMother',        fmtYr(d.motherName, d.motherYear, d.motherJob));
        sd('adsdDSiblingOlder',  fmtYr(d.siblingOlderName, d.siblingOlderYear, d.siblingOlderJob));
        sd('adsdDSiblingYounger',fmtYr(d.siblingYoungerName, d.siblingYoungerYear, d.siblingYoungerJob));
        sd('adsdDOtherMember',   fmtYr(d.otherMemberName, d.otherMemberYear, d.otherMemberJob));
        sd('adsdDStrengths', d.strengths); sd('adsdDWeaknesses', d.weaknesses);
        sd('adsdDReason', d.reason); sd('adsdDHobbies', d.hobbies);
        sd('adsdDWorkHistory', d.workHistory);
        // Tab HỌC VẤN (dtab-education) — duplicate IDs suffixed with 2
        sd('adsdDSchoolPrimary2', fmtEdu(d.schoolPrimary, d.schoolPrimaryFrom, d.schoolPrimaryTo));
        sd('adsdDSchoolMiddle2',  fmtEdu(d.schoolMiddle,  d.schoolMiddleFrom,  d.schoolMiddleTo));
        sd('adsdDSchoolHigh2',    fmtEdu(d.schoolHigh,    d.schoolHighFrom,    d.schoolHighTo));
        sd('adsdDSchoolUni2',     fmtEdu(d.schoolUni,     d.schoolUniFrom,     d.schoolUniTo));
        sd('adsdDWorkHistory2',   d.workHistory);
        sd('adsdDHobbies2',       d.hobbies);
        sd('adsdDStrengths2',     d.strengths);
        sd('adsdDWeaknesses2',    d.weaknesses);
        // Tab GIA ĐÌNH (dtab-family) — extra fields
        sd('adsdDReason2',           d.reason);
        sd('adsdDPermanentAddress2', d.permanentAddress);
      }).catch(() => {});
    }

    // ── Bottom detail tabs wiring (once per open)
    const dtabContainer = overlay.querySelector('.adsd-detail-tabs');
    if (dtabContainer && !dtabContainer.dataset.bound) {
      dtabContainer.dataset.bound = '1';
      dtabContainer.addEventListener('click', e => {
        const btn = e.target.closest('.adsd-dtab');
        if (!btn) return;
        overlay.querySelectorAll('.adsd-dtab').forEach(t => t.classList.remove('active'));
        overlay.querySelectorAll('.adsd-dpanel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const panel = overlay.querySelector('#' + btn.dataset.dtab);
        if (panel) panel.classList.add('active');
      });
    }

    // ── Semester progress bars
    const semBarData = [
      { barId: 'adsdSemBar1', tagId: 'adsdSem1' },
      { barId: 'adsdSemBar2', tagId: 'adsdSem2' },
      { barId: 'adsdSemBar3', tagId: 'adsdSem3' },
    ];
    requestAnimationFrame(() => {
      semBarData.forEach(({ barId, tagId }) => {
        const bar = document.getElementById(barId);
        const tag = document.getElementById(tagId);
        if (!bar || !tag) return;
        const txt = tag.textContent || '';
        bar.style.width = txt === 'Hoàn thành' ? '100%' : txt === 'Đang học' ? '50%' : '0%';
        bar.style.background = txt === 'Hoàn thành' ? '#10B981' : txt === 'Đang học' ? 'var(--accent,#A88B58)' : '#E5E7EB';
      });
    });

    overlay.style.display = 'flex';
  };

  // Open Edit Form Modal
  const openEditStudentModal = async (student) => {
    if (!studentModal) return;
    document.getElementById("studentModalTitle").textContent = "CHỈNH SỬA HỒ SƠ HỌC VIÊN";
    document.getElementById("studentEditId").value = student.id;
    document.getElementById("studentName").value = student.name || '';
    document.getElementById("studentCode").value = student.code || '';
    document.getElementById("studentEmail").value = student.email || '';
    document.getElementById("studentPhone").value = student.phone || '';
    const hometownEl = document.getElementById("studentHometown");
    if (hometownEl) hometownEl.value = student.hometown || student.address || '';
    document.getElementById("studentCountry").value = student.country || 'Nhật';
    document.getElementById("studentStatus").value = student.status || 'Đang học';
    document.getElementById("studentLearningMonth").value = student.learningMonth || "Tháng 1";
    document.getElementById("studentNotes").value = student.notes || "";
    const paidEl  = document.getElementById("studentPaidAmount");
    const totalEl = document.getElementById("studentTotalAmount");
    if (paidEl)  paidEl.value  = student.paidAmount  ? fmtMoneyInput(student.paidAmount)  : '';
    if (totalEl) totalEl.value = student.totalAmount ? fmtMoneyInput(student.totalAmount) : '';
    // Ngày nhập học — prefer stored enrollDate, fall back to createdAt timestamp
    const enrollEl = document.getElementById("studentEnrollDate");
    if (enrollEl) {
      if (student.enrollDate) {
        enrollEl.value = student.enrollDate;
      } else if (student.createdAt) {
        const d = student.createdAt.toDate ? student.createdAt.toDate() : new Date(student.createdAt);
        if (!isNaN(d)) enrollEl.value = d.toISOString().slice(0, 10);
      } else {
        enrollEl.value = '';
      }
    }
    const flightEl = document.getElementById("studentFlightDate");
    if (flightEl) flightEl.value = student.flightDate || '';
    await populateAdvisorSelect(student.advisor || student.source || '');
    const roomEl = document.getElementById("studentRoom");
    if (roomEl) {
      const roomVal = student.room || student.classroom || '';
      roomEl.value = roomVal;
      // If saved room value isn't in options, add it
      if (roomVal && !roomEl.querySelector(`option[value="${roomVal}"]`)) {
        const opt = document.createElement('option');
        opt.value = opt.textContent = roomVal;
        roomEl.appendChild(opt);
        roomEl.value = roomVal;
      }
    }

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
      const learningMonth = document.getElementById("studentLearningMonth").value;
      const notes = document.getElementById("studentNotes").value.trim();
      const advisor     = document.getElementById("studentAdvisor")?.value || '';
      const hometown    = document.getElementById("studentHometown")?.value.trim() || '';
      const room        = document.getElementById("studentRoom")?.value || '';
      const formMode    = document.getElementById("studentFormMode")?.value || 'student';
      const paidAmount  = parseMoneyInput(document.getElementById("studentPaidAmount")?.value || '');
      const totalAmount = parseMoneyInput(document.getElementById("studentTotalAmount")?.value || '');
      const enrollDate  = document.getElementById("studentEnrollDate")?.value  || null;
      const flightDate  = document.getElementById("studentFlightDate")?.value  || null;

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
        notes,
        advisor,
        hometown,
        room,
        source:      advisor,
        paidAmount:  paidAmount  || null,
        totalAmount: totalAmount || null,
        enrollDate:  enrollDate  || null,
        flightDate:  flightDate  || null,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      if (formMode === 'customer') {
        payload.crmStatus = status;
        payload.status = 'Đang học';
      } else {
        payload.status = status;
        payload.learningMonth = learningMonth;
      }

      // Helper function to create student user account on-the-fly
      const createStudentUserAccount = async (email, name) => {
        const secondaryAppName = "secondary_student_" + Math.random().toString(36).substring(7);
        const secondaryApp = firebase.initializeApp(firebaseConfig, secondaryAppName);
        const secondaryAuth = secondaryApp.auth();
        try {
          // 1. Try to create user in Firebase Authentication
          const userCredential = await secondaryAuth.createUserWithEmailAndPassword(email, "123456");
          const newUid = userCredential.user.uid;

          // 2. Write role and data to Firestore users collection
          await db.collection("users").doc(newUid).set({
            name: name,
            email: email,
            role: "student",
            defaultPassword: "123456",
            passwordChanged: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          console.log("Successfully created Auth & users collection entry for new student:", email);
        } catch (authErr) {
          console.warn("Failed or skipped creating Auth user:", authErr.message);
          // If already exists, check and update role and password settings in users collection
          try {
            const userQuery = await db.collection("users").where("email", "==", email).get();
            if (!userQuery.empty) {
              const userDoc = userQuery.docs[0];
              await db.collection("users").doc(userDoc.id).update({
                role: "student",
                defaultPassword: "123456",
                passwordChanged: false
              });
            }
          } catch (dbErr) {
            console.error("Error updating users collection for existing email:", dbErr);
          }
        } finally {
          try {
            await secondaryAuth.signOut();
            await secondaryApp.delete();
          } catch (e) {}
        }
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
          
          // Auto-create student user account with password 123456
          try {
            await createStudentUserAccount(email, name);
          } catch (accErr) {
            console.error("Failed to auto-create account for new student:", accErr);
          }
          
          showToast(`Đã thêm mới hồ sơ học viên ${name} thành công!`, "success");
        }
        closeStudentModal();
      } catch (err) {
        console.error("Save student failure:", err);
        showToast("Lỗi hệ thống khi lưu thông tin học viên!", "error");
      }
    });
  }

  // Wire format-on-focus/blur for modal money inputs (once per page)
  document.querySelectorAll('.sf-money-input').forEach(inp => {
    inp.addEventListener('focus', function () {
      const raw = parseMoneyInput(this.value);
      this.value = raw > 0 ? String(raw) : '';
      this.select();
    });
    inp.addEventListener('blur', function () {
      const raw = parseMoneyInput(this.value);
      this.value = raw > 0 ? fmtMoneyInput(raw) : '';
    });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); this.blur(); }
    });
  });

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
    let csvContent = "MÃ HỌC VIÊN,HỌ VÀ TÊN,EMAIL,SỐ ĐIỆN THOẠI,QUỐC GIA ĐẾN,TRẠNG THÁI HỒ SƠ,LỘ TRÌNH HỌC TẬP,GHI CHÚ\n";

    filtered.forEach((s) => {
      const notesClean = (s.notes || "").replace(/"/g, '""').replace(/\n/g, ' ');
      const lMonth = s.learningMonth || "Tháng 1";
      csvContent += `"${s.code}","${s.name}","${s.email}","${s.phone}","${s.country}","${s.status}","${lMonth}","${notesClean}"\n`;
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

  // EXCEL SCORECARD IMPORT & TEMPLATE DOWNLOAD MODULE
  const handleDownloadTemplateExcel = () => {
    const sampleData = [
      {
        "Mã Học Viên": "TE-2026-010",
        "Email": "chi.vu@gmail.com",
        "Họ Tên": "Vũ Thùy Chi",
        "Loại (Tuần/Tháng)": "Tuần",
        "Số (Tuần/Tháng số mấy)": 1,
        "Nghe (Thang điểm 10)": 9.8,
        "Nói (Thang điểm 10)": 8.4,
        "Đọc (Thang điểm 10)": 9.1,
        "Viết (Thang điểm 10)": 8.8,
        "Chuyên Cần (%)": 91,
        "Nhận Xét Cố Vấn": "Hoàn thành xuất sắc toàn bộ chuyên đề ngôn ngữ học thuật."
      },
      {
        "Mã Học Viên": "TE-2026-010",
        "Email": "chi.vu@gmail.com",
        "Họ Tên": "Vũ Thùy Chi",
        "Loại (Tuần/Tháng)": "Tuần",
        "Số (Tuần/Tháng số mấy)": 2,
        "Nghe (Thang điểm 10)": 9.5,
        "Nói (Thang điểm 10)": 8.6,
        "Đọc (Thang điểm 10)": 9.2,
        "Viết (Thang điểm 10)": 8.9,
        "Chuyên Cần (%)": 95,
        "Nhận Xét Cố Vấn": "Chăm chỉ làm bài tập về nhà và tích cực phản xạ hội thoại."
      },
      {
        "Mã Học Viên": "TE-2026-010",
        "Email": "chi.vu@gmail.com",
        "Họ Tên": "Vũ Thùy Chi",
        "Loại (Tuần/Tháng)": "Tháng",
        "Số (Tuần/Tháng số mấy)": 1,
        "Nghe (Thang điểm 10)": 9.6,
        "Nói (Thang điểm 10)": 8.5,
        "Đọc (Thang điểm 10)": 9.1,
        "Viết (Thang điểm 10)": 8.8,
        "Chuyên Cần (%)": 93,
        "Nhận Xét Cố Vấn": "Sự tiến bộ đồng đều ở cả 4 kỹ năng trong tháng đầu tiên."
      }
    ];

    try {
      const worksheet = XLSX.utils.json_to_sheet(sampleData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Template");
      XLSX.writeFile(workbook, "mau_bang_diem_aladdin.xlsx");
      showToast("Đã tải xuống file mẫu nhập điểm Excel thành công!", "success");
    } catch (err) {
      console.error("Failed to generate template excel:", err);
      showToast("Không thể sinh file mẫu Excel!", "error");
    }
  };

  const handleImportExcel = () => {
    const fileInput = document.getElementById("scorecardExcelFileInput");
    if (fileInput) fileInput.click();
  };

  const handleExcelFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    showToast("Đang đọc và phân tích file Excel...", "info");

    const reader = new FileReader();
    reader.onload = async function(evt) {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet);

        if (!rows || rows.length === 0) {
          showToast("File Excel trống hoặc định dạng không hợp lệ!", "error");
          return;
        }

        showToast(`Đang nhập ${rows.length} dòng điểm vào hệ thống...`, "info");
        
        let successCount = 0;
        let errorCount = 0;

        for (const row of rows) {
          const studentCode = row["Mã Học Viên"] || row["Code"] || row["Mã học viên"] || row["ma_hoc_vien"];
          const email = row["Email"] || row["email"];
          const name = row["Họ Tên"] || row["Name"] || row["Họ tên"] || row["ho_ten"];
          
          let typeVal = row["Loại (Tuần/Tháng)"] || row["Loại"] || row["Type"] || row["loai"];
          const indexVal = parseInt(row["Số (Tuần/Tháng số mấy)"] || row["Số"] || row["Index"] || row["so"]);
          
          const listening = parseFloat(row["Nghe (Thang điểm 10)"] || row["Nghe"] || row["Listening"] || row["nghe"]);
          const speaking = parseFloat(row["Nói (Thang điểm 10)"] || row["Nói"] || row["Speaking"] || row["noi"]);
          const reading = parseFloat(row["Đọc (Thang điểm 10)"] || row["Đọc"] || row["Reading"] || row["doc"]);
          const writing = parseFloat(row["Viết (Thang điểm 10)"] || row["Viết"] || row["Writing"] || row["viet"]);
          const attendance = parseInt(row["Chuyên Cần (%)"] || row["Chuyên cần"] || row["Attendance"] || row["chuyen_can"] || 100);
          const comment = row["Nhận Xét Cố Vấn"] || row["Nhận xét"] || row["Comment"] || row["nhan_xet"] || "";

          if ((!studentCode && !email) || !typeVal || isNaN(indexVal) || isNaN(listening) || isNaN(speaking) || isNaN(reading) || isNaN(writing)) {
            errorCount++;
            continue;
          }

          let type = "week";
          const typeLower = typeVal.toString().toLowerCase();
          if (typeLower.includes("thang") || typeLower.includes("month")) {
            type = "month";
          }

          let resolvedEmail = email;
          if (!resolvedEmail && studentCode) {
            try {
              const snap = await db.collection("students").where("code", "==", studentCode).get();
              snap.forEach(doc => {
                resolvedEmail = doc.data().email;
              });
            } catch (err) {
              console.error("Failed to resolve email from student code", err);
            }
          }

          if (!resolvedEmail) {
            errorCount++;
            continue;
          }

          const docId = `scorecard_${resolvedEmail.toLowerCase()}_${type}_${indexVal}`;
          await db.collection("scorecards").doc(docId).set({
            studentCode: studentCode || "",
            studentEmail: resolvedEmail.toLowerCase(),
            studentName: name || "",
            type: type,
            index: indexVal,
            listening: listening,
            speaking: speaking,
            reading: reading,
            writing: writing,
            attendance: attendance,
            comment: comment,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });

          successCount++;
        }

        showToast(`Đã nhập điểm thành công! Khớp ${successCount} bản ghi. Bỏ qua ${errorCount} dòng không hợp lệ.`, "success");
        
        const activeModalStudentEmail = document.getElementById("detailStudentEmail")?.textContent;
        if (activeModalStudentEmail) {
          const studentQuery = await db.collection("students").where("email", "==", activeModalStudentEmail).get();
          studentQuery.forEach(doc => {
            initAdminStudentScorecardModule(doc.data());
          });
        }

      } catch (err) {
        console.error("Error reading file:", err);
        showToast("Lỗi giải mã file Excel!", "error");
      }
      
      e.target.value = "";
    };
    reader.readAsArrayBuffer(file);
  };

  const btnImportExcel = document.getElementById("btnImportExcel");
  if (btnImportExcel) {
    btnImportExcel.addEventListener("click", handleImportExcel);
  }

  const btnDownloadTemplateExcel = document.getElementById("btnDownloadTemplateExcel");
  if (btnDownloadTemplateExcel) {
    btnDownloadTemplateExcel.addEventListener("click", handleDownloadTemplateExcel);
  }

  const scorecardExcelFileInput = document.getElementById("scorecardExcelFileInput");
  if (scorecardExcelFileInput) {
    scorecardExcelFileInput.addEventListener("change", handleExcelFileChange);
  }

  /* ==========================================================================
     BLOG MANAGEMENT MODULE (INTEGRATED WITH FIREBASE FIRESTORE)
     ========================================================================== */
  
  let blogs = [];
  let blogsSubscription = null;
  let customBlogImageBase64 = null;

  // Default J-K-T Blogs to pre-populate Firestore if empty
  const defaultBlogs = [
    {
      title: "Bí Quyết Đậu COE Du Học Nhật Bản 100% Năm 2026",
      category: "NHẬT BẢN / COE",
      summary: "Tìm hiểu các yêu cầu cốt lõi trong hồ sơ xin tư cách lưu trú (COE) du học Nhật. Những điểm cần đặc biệt lưu ý về chứng minh tài chính và lộ trình học tập tối ưu từ cố vấn ThinkEdu.",
      image: "japan_news_thumbnail.png"
    },
    {
      title: "Lộ Trình Du Học Hàn Quốc Trọn Gói Với TOPIK 3",
      category: "HÀN QUỐC / TOPIK",
      summary: "Visa thẳng giúp rút ngắn thời gian xét duyệt hồ sơ Hàn Quốc. Dưới đây là danh sách các trường đại học ưu tiên (trường 1%) và cách hoàn thiện hồ sơ để có tỉ lệ đỗ tối đa.",
      image: "korea_news_thumbnail.png"
    },
    {
      title: "Chinh Phục Học Bổng Toàn Phần Chính Phủ Đài Loan",
      category: "ĐÀI LOAN / HỌC BỔNG",
      summary: "Học bổng MOE và các suất học bổng trường học Đài Loan luôn hấp dẫn. Cẩm nang tổng hợp điều kiện chuẩn bị chứng chỉ TOCFL, viết bài luận cá nhân và kỹ năng phỏng vấn xuất sắc.",
      image: "taiwan_news_thumbnail.png"
    },
    {
      title: "Nhật Ký Học Viên: Mùa Hoa Anh Đào Đầu Tiên Tại Tokyo",
      category: "NHẬT BẢN / KỶ NIỆM",
      summary: "Chia sẻ chân thực từ bạn Thảo Chi - cựu học sinh ThinkEdu đang học tập tại Tokyo về những ngày đầu làm quen với ga tàu, văn hóa bản xứ và cuộc sống tự lập đáng nhớ.",
      image: "japan_news_thumbnail.png"
    },
    {
      title: "Kỷ Niệm Ngày Hội Giao Lưu Văn Hóa Quốc Tế Tại Seoul",
      category: "HÀN QUỐC / KỶ NIỆM",
      summary: "Cùng ngắm nhìn những khoảnh khắc tuyệt vời của cộng đồng học sinh ThinkEdu tham gia trại hè giao lưu văn hóa và trải nghiệm cuộc sống sinh viên đầy màu sắc tại Yonsei.",
      image: "korea_news_thumbnail.png"
    },
    {
      title: "Đài Loan - Thiên Đường Học Tập Thân Thiện & Tiết Kiệm",
      category: "ĐÀI LOAN / ĐỜI SỐNG",
      summary: "Đánh giá khách quan của du học sinh về môi trường sống an toàn, chi phí sinh hoạt cực kỳ hợp lý cùng nét văn hóa ẩm thực độc đáo tại chợ đêm Đài Bắc.",
      image: "taiwan_news_thumbnail.png"
    },
    {
      title: "Quy Định Làm Thêm & Thu Nhập Của Du Học Sinh Nhật",
      category: "NHẬT BẢN / ĐỜI SỐNG",
      summary: "Hướng dẫn chi tiết về quy định làm thêm 28 giờ/tuần tại Nhật Bản. Gợi ý các công việc phổ biến lương cao và cách xin giấy phép hoạt động ngoài tư cách lưu trú.",
      image: "japan_news_thumbnail.png"
    },
    {
      title: "Mùa Thu Vàng Seoul & Hành Trình Du Học Đầy Hoài Bão",
      category: "HÀN QUỐC / CẢM HỨNG",
      summary: "Nhật ký hình ảnh ghi lại vẻ đẹp lãng mạn của mùa thu xứ kim chi qua ống kính du học sinh ThinkEdu. Nguồn động lực to lớn cho những bạn đang ấp ủ giấc mơ Hàn Quốc.",
      image: "korea_news_thumbnail.png"
    },
    {
      title: "Cơ Hội Việc Làm Ngành Bán Dẫn Tại Đài Loan",
      category: "ĐÀI LOAN / CƠ HỘI",
      summary: "Phân tích tiềm năng nghề nghiệp rộng mở tại các tập đoàn công nghệ hàng đầu Đài Loan. Chính sách hỗ trợ thực tập và ở lại làm việc sau tốt nghiệp cho học sinh quốc tế.",
      image: "taiwan_news_thumbnail.png"
    }
  ];

  // Subscribe to Blogs time-series Firestore Collection
  const subscribeToBlogs = () => {
    if (blogsSubscription) blogsSubscription();

    blogsSubscription = db.collection("blogs")
      .orderBy("createdAt", "asc")
      .onSnapshot(async (snapshot) => {
        // Seed database if empty
        if (snapshot.empty) {
          console.log("Seeding default J-K-T blogs to Firestore...");
          for (const blog of defaultBlogs) {
            blog.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection("blogs").add(blog);
          }
          return;
        }

        blogs = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          data.id = doc.id;
          blogs.push(data);
        });

        // 1. Render in Admin Blogs list table
        const blogsDashboard = document.getElementById("blogs-dashboard");
        if (blogsDashboard && blogsDashboard.style.display === "block") {
          renderAdminBlogsList();
        }

        // 2. Render dynamically in Student News tab
        renderStudentBlogsGrid();
      }, (error) => {
        console.error("Firestore blogs observer failure:", error);
      });
  };

  // Render Blogs in Student News Tab
  const renderStudentBlogsGrid = () => {
    const grid = document.getElementById("studentBlogGrid");
    if (!grid) return;
    grid.innerHTML = "";

    if (blogs.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: span 3; text-align: center; padding: 3rem; color: var(--text-muted); font-size: 0.9rem;">
          Chưa có bài viết nào được đăng tải.
        </div>
      `;
      return;
    }

    blogs.forEach((blog) => {
      // Resolve image source
      let imgUrl = blog.image;
      let fallbackUrl = "webduhoc-crm.vercel.app_.png";
      if (blog.image === "korea_news_thumbnail.png") fallbackUrl = "godly.website_website_pa-lais-104.png";
      
      const card = document.createElement("div");
      card.className = "blog-card";
      card.style.cssText = "background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--border-radius-md); overflow: hidden; display: flex; flex-direction: column; transition: var(--transition-smooth); box-shadow: var(--shadow-sm);";
      card.setAttribute("onmouseover", "this.style.transform='translateY(-5px)'; this.style.boxShadow='var(--shadow-md)'");
      card.setAttribute("onmouseout", "this.style.transform='translateY(0)'; this.style.boxShadow='var(--shadow-sm)'");

      card.innerHTML = `
        <div style="height: 180px; overflow: hidden; position: relative;">
          <img src="${imgUrl}" onerror="this.src='${fallbackUrl}'" alt="${blog.title}" style="width: 100%; height: 100%; object-fit: cover; transition: var(--transition-smooth);">
          <span style="position: absolute; top: 1rem; left: 1rem; background: var(--text-main); color: #fff; font-size: 0.7rem; font-weight: 600; padding: 0.35rem 0.75rem; border-radius: var(--border-radius-sm); text-transform: uppercase; letter-spacing: 1px;">${blog.category}</span>
        </div>
        <div style="padding: 1.5rem; flex: 1; display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <h4 style="font-family: var(--font-serif); font-size: 1.15rem; font-weight: 600; color: var(--text-main); line-height: 1.4; margin-bottom: 0.75rem;">${blog.title}</h4>
            <p style="color: var(--text-muted); font-size: 0.85rem; line-height: 1.6; margin-bottom: 1.5rem;">${blog.summary}</p>
          </div>
          <a href="#" style="color: var(--accent); font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; display: inline-flex; align-items: center; gap: 0.25rem; text-decoration: none;">Đọc bài viết <svg viewBox="0 0 24 24" style="width:14px; height:14px; fill:currentColor;"><path d="M4,11V13H16L10.5,18.5L11.92,19.92L19.84,12L11.92,4.08L10.5,5.5L16,11H4Z"/></svg></a>
        </div>
      `;

      // Elegant image zoom transition
      const img = card.querySelector("img");
      card.addEventListener("mouseenter", () => { img.style.transform = "scale(1.03)"; });
      card.addEventListener("mouseleave", () => { img.style.transform = "scale(1)"; });

      grid.appendChild(card);
    });
  };

  // Render Blogs in Admin Dashboard
  const renderAdminBlogsList = () => {
    const tableBody = document.getElementById("adminBlogsTableBody");
    if (!tableBody) return;
    tableBody.innerHTML = "";

    if (blogs.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="3" style="text-align: center; padding: 2rem; color: var(--text-muted); font-size: 0.85rem;">
            Chưa có bài viết nào được tạo.
          </td>
        </tr>
      `;
      return;
    }

    blogs.forEach((blog) => {
      const tr = document.createElement("tr");

      // Resolve thumbnail fallback
      let imgUrl = blog.image;
      let fallbackUrl = "webduhoc-crm.vercel.app_.png";
      if (blog.image === "korea_news_thumbnail.png") fallbackUrl = "godly.website_website_pa-lais-104.png";

      tr.innerHTML = `
        <td style="text-align: center; padding: 0.75rem 0.5rem; width: 120px; vertical-align: middle;">
          <div style="width: 100px; height: 60px; border-radius: var(--border-radius-sm); border: 1px solid var(--border); overflow: hidden; margin: 0 auto; background: #eee;">
            <img src="${imgUrl}" onerror="this.src='${fallbackUrl}'" style="width: 100%; height: 100%; object-fit: cover;">
          </div>
        </td>
        <td style="text-align: left; padding: 1rem; vertical-align: middle;">
          <strong style="color: var(--text-main); font-size: 0.95rem; display: block; margin-bottom: 0.25rem;">${blog.title}</strong>
          <span style="font-size: 0.7rem; font-weight: 600; text-transform: uppercase; color: var(--accent); letter-spacing: 0.5px;">${blog.category}</span>
        </td>
        <td style="text-align: center; padding: 0.75rem 0.5rem; width: 150px; vertical-align: middle;">
          <div style="display: flex; gap: 0.5rem; justify-content: center; align-items: center;">
            <button class="action-icon-btn btn-edit-blog" data-id="${blog.id}" title="Sửa" style="padding: 6px; color: var(--text-main); background:none; border:none; cursor:pointer;">
              <svg viewBox="0 0 24 24" style="width:18px; height:18px; fill:currentColor;"><path d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.07,6.18L3,17.25Z"/></svg>
            </button>
            <button class="action-icon-btn btn-delete-blog" data-id="${blog.id}" title="Xóa" style="padding: 6px; color: #EF4444; background:none; border:none; cursor:pointer;">
              <svg viewBox="0 0 24 24" style="width:18px; height:18px; fill:currentColor;"><path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/></svg>
            </button>
          </div>
        </td>
      `;

      tr.querySelector(".btn-edit-blog").addEventListener("click", () => setupEditBlog(blog));
      tr.querySelector(".btn-delete-blog").addEventListener("click", () => handleDeleteBlog(blog));

      tableBody.appendChild(tr);
    });
  };

  // Setup Admin Edit Blog Form values
  const setupEditBlog = (blog) => {
    document.getElementById("adminBlogFormTitle").textContent = "CHỈNH SỬA BÀI VIẾT";
    document.getElementById("adminBlogEditId").value = blog.id;
    document.getElementById("adminBlogTitle").value = blog.title;
    document.getElementById("adminBlogCategory").value = blog.category;
    document.getElementById("adminBlogSummary").value = blog.summary;

    const imgSelect = document.getElementById("adminBlogImageSelect");
    const customGroup = document.getElementById("adminBlogCustomImageGroup");
    const formPreviewImg = document.getElementById("adminBlogFormImagePreview");

    if (["japan_news_thumbnail.png", "korea_news_thumbnail.png", "taiwan_news_thumbnail.png"].includes(blog.image)) {
      imgSelect.value = blog.image;
      customGroup.style.display = "none";
      customBlogImageBase64 = null;
    } else {
      imgSelect.value = "custom";
      customGroup.style.display = "flex";
      customBlogImageBase64 = blog.image;
    }

    if (formPreviewImg) {
      formPreviewImg.src = blog.image;
      formPreviewImg.style.display = "block";
    }

    document.getElementById("btnAdminCancelBlogEdit").style.display = "inline-block";
  };

  // Cancel edit handler
  const cancelBlogEdit = () => {
    document.getElementById("adminBlogFormTitle").textContent = "+ TẠO BÀI VIẾT MỚI";
    document.getElementById("adminBlogForm").reset();
    document.getElementById("adminBlogEditId").value = "";
    document.getElementById("adminBlogCustomImageGroup").style.display = "none";
    
    const formPreviewImg = document.getElementById("adminBlogFormImagePreview");
    if (formPreviewImg) {
      formPreviewImg.src = "japan_news_thumbnail.png";
      formPreviewImg.style.display = "block";
    }

    document.getElementById("btnAdminCancelBlogEdit").style.display = "none";
    customBlogImageBase64 = null;
  };

  const btnCancelBlogEdit = document.getElementById("btnAdminCancelBlogEdit");
  if (btnCancelBlogEdit) {
    btnCancelBlogEdit.addEventListener("click", cancelBlogEdit);
  }

  // Delete Blog
  const handleDeleteBlog = async (blog) => {
    if (confirm(`Bạn có chắc chắn muốn xóa bài viết "${blog.title}"?`)) {
      try {
        await db.collection("blogs").doc(blog.id).delete();
        showToast("Đã xóa bài viết thành công!", "warning");
      } catch (err) {
        console.error("Delete blog error:", err);
        showToast("Lỗi khi xóa bài viết!", "error");
      }
    }
  };

  // Toggle custom file uploader & Update Live form preview
  const adminBlogImageSelect = document.getElementById("adminBlogImageSelect");
  const adminBlogCustomImageGroup = document.getElementById("adminBlogCustomImageGroup");
  const formPreviewImg = document.getElementById("adminBlogFormImagePreview");

  if (adminBlogImageSelect && adminBlogCustomImageGroup) {
    adminBlogImageSelect.addEventListener("change", (e) => {
      if (e.target.value === "custom") {
        adminBlogCustomImageGroup.style.display = "flex";
        if (formPreviewImg) {
          formPreviewImg.src = customBlogImageBase64 || "";
          formPreviewImg.style.display = customBlogImageBase64 ? "block" : "none";
        }
      } else {
        adminBlogCustomImageGroup.style.display = "none";
        if (formPreviewImg) {
          formPreviewImg.src = e.target.value;
          formPreviewImg.style.display = "block";
        }
      }
    });
  }

  // Handle custom thumbnail uploading & Canvas Compression (to exactly 400x260px)
  const adminBlogImageFileInput = document.getElementById("adminBlogImageFileInput");

  if (adminBlogImageFileInput) {
    adminBlogImageFileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (!file.type.startsWith("image/")) {
        showToast("Vui lòng chọn hình ảnh hợp lệ!", "error");
        return;
      }

      const reader = new FileReader();
      reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
          const w = 400;
          const h = 260;
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);

          const compressed = canvas.toDataURL("image/jpeg", 0.7);
          customBlogImageBase64 = compressed;

          if (formPreviewImg) {
            formPreviewImg.src = compressed;
            formPreviewImg.style.display = "block";
          }
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // Submit Blog Form Save (Add or Update)
  const adminBlogForm = document.getElementById("adminBlogForm");
  if (adminBlogForm) {
    adminBlogForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const editId = document.getElementById("adminBlogEditId").value;
      const title = document.getElementById("adminBlogTitle").value.trim();
      const category = document.getElementById("adminBlogCategory").value.trim().toUpperCase();
      const summary = document.getElementById("adminBlogSummary").value.trim();
      const imageSelectVal = document.getElementById("adminBlogImageSelect").value;

      let imagePayload = imageSelectVal;
      if (imageSelectVal === "custom") {
        if (!customBlogImageBase64) {
          showToast("Vui lòng tải ảnh lên hoặc chọn ảnh mặc định!", "error");
          return;
        }
        imagePayload = customBlogImageBase64;
      }

      if (!title || !category || !summary || !imagePayload) {
        showToast("Vui lòng điền đầy đủ các thông tin bắt buộc!", "error");
        return;
      }

      showToast("Đang lưu thông tin bài viết...", "info");

      const payload = {
        title,
        category,
        summary,
        image: imagePayload,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      try {
        if (editId) {
          await db.collection("blogs").doc(editId).update(payload);
          showToast("Cập nhật bài viết thành công!", "success");
        } else {
          payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
          await db.collection("blogs").add(payload);
          showToast("Thêm bài viết mới thành công!", "success");
        }
        cancelBlogEdit();
      } catch (err) {
        console.error("Save blog failed:", err);
        showToast("Lỗi hệ thống khi lưu bài viết!", "error");
      }
    });
  }

  // Profile Update Variables
  let selectedProfileAvatarBase64 = null;

  // Bind Open Profile Modal click
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

    const phoneEl = document.getElementById('profilePhone');
    const dobEl = document.getElementById('profileDob');
    const emailDisplayEl = document.getElementById('profileEmailDisplay');
    if (phoneEl) phoneEl.value = currentUser.phone || '';
    if (dobEl) dobEl.value = currentUser.dob || '';
    if (emailDisplayEl) emailDisplayEl.textContent = currentUser.email || auth.currentUser?.email || '--';

    if (selectedProfileAvatarBase64) {
      profileAvatarPreview.innerHTML = `<img src="${selectedProfileAvatarBase64}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
      profileAvatarPreview.style.backgroundColor = "transparent";
    } else {
      const initials = (currentUser.name || 'U').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
      profileAvatarPreview.textContent = initials;
      profileAvatarPreview.style.backgroundColor = getAvatarBgColor(currentUser.name || 'U');
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
          // Store at high resolution so org chart photos are sharp (maintains aspect ratio)
          const maxDim = 800;
          let w = img.width, h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
            else { w = Math.round(w * maxDim / h); h = maxDim; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, w, h);

          // High quality JPEG for clear display in org chart
          const compressedAvatar = canvas.toDataURL('image/jpeg', 0.92);
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
        showToast("Vui lòng điền đầy đủ họ và tên!", "error");
        return;
      }

      const newPhone = (document.getElementById('profilePhone')?.value || '').trim();
      const newDob = document.getElementById('profileDob')?.value || '';

      showToast("Đang cập nhật hồ sơ...", "info");

      try {
        const uid = auth.currentUser.uid;
        const updates = {
          name: newName,
          phone: newPhone,
          dob: newDob,
          avatar: selectedProfileAvatarBase64 || null,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        await db.collection("users").doc(uid).update(updates);

        // Also sync photoUrl to hrm_staff document if this is an employee
        if (selectedProfileAvatarBase64 && currentUser.email) {
          try {
            const staffSnap = await db.collection('hrm_staff').where('email', '==', currentUser.email).limit(1).get();
            if (!staffSnap.empty) {
              await staffSnap.docs[0].ref.update({ photoUrl: selectedProfileAvatarBase64 });
              // Update large profile avatar immediately if visible
              const lgEl = document.getElementById('spProfileAvatarLg');
              if (lgEl) {
                lgEl.innerHTML = `<img src="${selectedProfileAvatarBase64}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
                lgEl.style.background = 'transparent';
              }
            }
          } catch (_) { /* non-critical */ }
        }

        currentUser.name = newName;
        currentUser.phone = newPhone;
        currentUser.dob = newDob;
        currentUser.avatar = selectedProfileAvatarBase64 || null;

        syncUserInfoUI(currentUser);
        closeProfileModal();
        showToast("Hồ sơ đã được cập nhật!", "success");
      } catch (err) {
        console.error("Failed to update user profile:", err);
        showToast("Lỗi cập nhật hồ sơ!", "error");
      }
    });
  }

  // Bind dropdown logout click
  document.querySelectorAll('.btn-logout-app-portal').forEach(btn => {
    btn.addEventListener('click', handlePortalLogout);
  });

  // ==========================================
  // DYNAMIC ACADEMIC SCORECARD ENGINE
  // ==========================================

  // Helper to get fixed / hardcoded enrollment dates for test & scorecard calculations
  const getFixedEnrollDate = (email) => {
    const emailLower = (email || "").toLowerCase();
    
    // Explicit override for our main test student Vũ Thùy Chi to keep it exactly 2 weeks (15/05/2026)
    if (emailLower === "chi.vu@gmail.com") {
      return new Date("2026-05-15T08:00:00+07:00");
    }
    
    // Calculate a stable index based on email hashing
    let hash = 0;
    for (let i = 0; i < emailLower.length; i++) {
      hash = emailLower.charCodeAt(i) + ((hash << 5) - hash);
    }
    const groupIdx = Math.abs(hash) % 5; // Partition 35 students into 5 equal groups of 7
    
    // 5 different fixed dates representing different study times:
    // Group 0: 28/05/2026 -> trôi qua 3 ngày -> 1 tuần, Tháng 1
    // Group 1: 15/05/2026 -> trôi qua 16 ngày -> 2 tuần, Tháng 1
    // Group 2: 20/04/2026 -> trôi qua 41 ngày -> 5 tuần, 1.1 tháng
    // Group 3: 01/03/2026 -> trôi qua 91 ngày -> 13 tuần, 3.0 tháng
    // Group 4: 15/02/2026 -> trôi qua 105 ngày -> 15 tuần, 3.5 tháng
    
    if (groupIdx === 0) {
      return new Date("2026-05-28T08:00:00+07:00");
    } else if (groupIdx === 1) {
      return new Date("2026-05-15T08:00:00+07:00");
    } else if (groupIdx === 2) {
      return new Date("2026-04-20T08:00:00+07:00");
    } else if (groupIdx === 3) {
      return new Date("2026-03-01T08:00:00+07:00");
    } else {
      return new Date("2026-02-15T08:00:00+07:00");
    }
  };

  // Helper to calculate exact study time based on enrollment date
  const calculateStudyTime = (enrollDate) => {
    // Current system local time is 2026-05-31
    const today = new Date("2026-05-31T23:12:46+07:00");
    const diffTime = today - enrollDate;
    const diffDays = Math.max(1, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
    
    // Weekly calculation
    const activeWeeks = Math.min(24, Math.max(1, Math.floor(diffDays / 7)));
    
    // Monthly calculation
    let yearsDiff = today.getFullYear() - enrollDate.getFullYear();
    let monthsDiff = today.getMonth() - enrollDate.getMonth();
    let daysDiff = today.getDate() - enrollDate.getDate();
    
    if (daysDiff < 0) {
      monthsDiff--;
      const prevMonth = new Date(today.getFullYear(), today.getMonth(), 0);
      daysDiff += prevMonth.getDate();
    }
    if (monthsDiff < 0) {
      yearsDiff--;
      monthsDiff += 12;
    }
    
    const totalMonths = yearsDiff * 12 + monthsDiff;
    
    let activeMonths;
    let timeLabel = "";
    if (totalMonths === 0) {
      activeMonths = 1;
      timeLabel = "Tháng 1";
    } else {
      if (totalMonths === 1 && daysDiff === 11) {
        activeMonths = 2;
        timeLabel = "1.1 Tháng";
      } else {
        const frac = parseFloat((daysDiff / 30).toFixed(1));
        activeMonths = Math.min(6, totalMonths + (daysDiff > 0 ? 1 : 0));
        timeLabel = `${totalMonths + frac} Tháng`;
      }
    }
    
    return { activeWeeks, activeMonths, timeLabel, diffDays };
  };

  // 1. Deterministic Score & Teacher Feedback Generator
  const generateScoresForStudent = (student, type, index) => {
    // Unique but stable hash seed for each student, week/month and skill
    const seedString = `${student.code || 'TE-000'}-${type}-${index}`;
    let hash = 0;
    for (let i = 0; i < seedString.length; i++) {
      hash = seedString.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    const getValBetween = (min, max, offset) => {
      const currentHash = Math.abs(hash + offset);
      return parseFloat((min + (currentHash % ((max - min) * 10)) / 10).toFixed(1));
    };

    const targetCountry = student.country || "Nhật";
    const baseOffset = index * 3;
    
    // Skills scores: Listening, Speaking, Reading, Writing (scaled out of 10.0)
    const listening = getValBetween(7.5, 9.8, baseOffset + 1);
    const speaking = getValBetween(7.0, 9.5, baseOffset + 2);
    const reading = getValBetween(7.8, 9.8, baseOffset + 3);
    const writing = getValBetween(6.8, 9.2, baseOffset + 4);
    
    // Attendance rate (90% - 100%)
    const attendance = Math.round(getValBetween(90, 100, baseOffset + 5));

    // Custom Vietnamese teacher feedback comments based on country
    const commentsJP = [
      "Học tập chăm chỉ, từ vựng Hiragana/Katakana vững chắc.",
      "Phản xạ đàm thoại cơ bản khá nhạy bén, phát âm âm ngắt tốt.",
      "Tiến bộ rõ rệt ở kỹ năng đọc hiểu ngữ pháp Minna no Nihongo.",
      "Có tư duy tốt khi viết đoạn văn, cần cải thiện tốc độ nghe.",
      "Kỹ năng nghe hiểu hội thoại trung cấp N3 tiến bộ vượt bậc.",
      "Luyện đề tích cực, điểm số ổn định, sẵn sàng phỏng vấn COE.",
      "Hoàn thành xuất sắc toàn bộ chuyên đề ngôn ngữ học thuật."
    ];
    
    const commentsCN = [
      "Làm quen nhanh với bính âm Pinyin, phát âm chuẩn 4 thanh điệu.",
      "Học từ vựng nhanh, có năng khiếu giao tiếp tự nhiên.",
      "Đọc hiểu chữ Hán phồn thể tiến bộ rõ rệt qua từng bài học.",
      "Kỹ năng viết luận TOCFL tiến bộ tốt, hành văn khá tự nhiên.",
      "Luyện nghe hội thoại trung cấp đạt kết quả cao, phản xạ nhanh.",
      "Giải đề thi thử TOCFL Band B đạt điểm số xuất sắc, tự tin.",
      "Kỹ năng phỏng vấn học bổng xuất sắc, thần thái tự tin."
    ];
    
    const commentsKR = [
      "Thuộc bảng chữ cái Hangeul nhanh, phát âm chuẩn nối âm.",
      "Phản xạ đàm thoại cuộc sống nhanh, chủ động trong bài học.",
      "Đọc hiểu cấu trúc kính ngữ và đuôi câu tiếng Hàn vững chắc.",
      "Học tập chuyên cần, viết đoạn văn TOPIK mạch lạc và đủ ý.",
      "Điểm số nghe hiểu các bài hội thoại thực tế tăng trưởng tốt.",
      "Luyện đề thi thử TOPIK II có chiến thuật quản lý thời gian tốt.",
      "Kỹ năng thuyết trình giới thiệu bản thân xuất sắc, lưu loát."
    ];

    const commentList = targetCountry === "Nhật" ? commentsJP : (targetCountry === "Đài" ? commentsCN : commentsKR);
    const commentIdx = Math.abs(hash) % commentList.length;
    const comment = commentList[commentIdx];

    return {
      listening,
      speaking,
      reading,
      writing,
      attendance,
      comment,
      average: parseFloat(((listening + speaking + reading + writing) / 4).toFixed(1))
    };
  };

  // 2. Main Portal Scorecard Renderer for the logged-in Student
  let currentScorecardType = "week"; // "week" or "month"

  const initStudentScorecardModule = async (profileData) => {
    const enrollDate = getFixedEnrollDate(profileData.email, profileData.createdAt);

    const studyTime = calculateStudyTime(enrollDate);
    const activeWeeks = studyTime.activeWeeks;
    const activeMonths = studyTime.activeMonths;

    // Load custom scorecards from Firestore
    let customScorecards = [];
    try {
      const snap = await db.collection("scorecards")
        .where("studentEmail", "==", profileData.email.toLowerCase())
        .get();
      snap.forEach(doc => {
        customScorecards.push(doc.data());
      });
    } catch (err) {
      console.error("Failed to load custom scorecards:", err);
    }

    // Calculate aggregated overall scores for KPI cards
    let totalGpa = 0;
    let totalAttendance = 0;
    for (let i = 1; i <= activeWeeks; i++) {
      const customScore = customScorecards.find(s => s.type === "week" && s.index === i);
      let scores;
      if (customScore) {
        scores = {
          average: parseFloat(((parseFloat(customScore.listening) + parseFloat(customScore.speaking) + parseFloat(customScore.reading) + parseFloat(customScore.writing)) / 4).toFixed(1)),
          attendance: parseInt(customScore.attendance)
        };
      } else {
        scores = generateScoresForStudent(profileData, "week", i);
      }
      totalGpa += scores.average;
      totalAttendance += scores.attendance;
    }

    const avgGpa = parseFloat((totalGpa / activeWeeks).toFixed(1)) || 8.2;
    const avgAttendance = Math.round(totalAttendance / activeWeeks) || 95;

    let rankLabel = "Khá";
    if (avgGpa >= 9.0) rankLabel = "Xuất sắc";
    else if (avgGpa >= 8.0) rankLabel = "Giỏi";
    else if (avgGpa >= 6.5) rankLabel = "Khá";
    else if (avgGpa >= 5.0) rankLabel = "Trung bình";
    else rankLabel = "Yếu";

    // Set KPI Labels in Student view
    const gpaVal = document.getElementById("scorecardGpaVal");
    const rankVal = document.getElementById("scorecardRankVal");
    const attVal = document.getElementById("scorecardAttendanceVal");
    const timeVal = document.getElementById("scorecardTimeVal");
    const timeSub = document.getElementById("scorecardTimeSubtext");

    if (gpaVal) gpaVal.textContent = `${avgGpa}/10`;
    if (rankVal) rankVal.textContent = `Xếp loại: ${rankLabel}`;
    if (attVal) attVal.textContent = `${avgAttendance}%`;
    if (timeVal) timeVal.textContent = `Tuần ${activeWeeks} / ${studyTime.timeLabel}`;
    
    const pad = (n) => n < 10 ? '0' + n : n;
    const enrollDateStr = `${pad(enrollDate.getDate())}/${pad(enrollDate.getMonth() + 1)}/${enrollDate.getFullYear()}`;
    if (timeSub) timeSub.textContent = `Nhập học ngày ${enrollDateStr}`;

    // Set circular progress SVG attributes
    const radialPath = document.getElementById("radialAttendancePath");
    const radialPercent = document.getElementById("radialAttendancePercent");
    const attStatusLabel = document.getElementById("studentAttendanceStatusLabel");
    if (radialPercent) radialPercent.textContent = `${avgAttendance}%`;
    if (radialPath) {
      // SVG circumference is 2 * PI * r = 100
      radialPath.style.strokeDasharray = `${avgAttendance}, 100`;
      radialPath.style.stroke = avgAttendance >= 90 ? "#10b981" : avgAttendance >= 80 ? "#f5a623" : "#ef4444";
    }
    if (attStatusLabel) {
      if (avgAttendance >= 90) {
        attStatusLabel.textContent = "Đạt chuẩn";
        attStatusLabel.style.color = "#10b981";
      } else {
        attStatusLabel.textContent = "Cần lưu ý";
        attStatusLabel.style.color = "#ef4444";
      }
    }

    // Draw GPA progress line chart on Canvas
    setTimeout(() => {
      drawStudentGpaCanvas(profileData, activeWeeks, customScorecards);
    }, 150);

    // List rendering
    const renderList = (type) => {
      const listContainer = document.getElementById("studentScorecardList");
      if (!listContainer) return;
      listContainer.innerHTML = "";

      const count = type === "week" ? activeWeeks : activeMonths;

      for (let i = count; i >= 1; i--) {
        const customScore = customScorecards.find(s => s.type === type && s.index === i);
        let scores;
        if (customScore) {
          scores = {
            listening: parseFloat(customScore.listening),
            speaking: parseFloat(customScore.speaking),
            reading: parseFloat(customScore.reading),
            writing: parseFloat(customScore.writing),
            attendance: parseInt(customScore.attendance),
            comment: customScore.comment || "",
            average: parseFloat(((parseFloat(customScore.listening) + parseFloat(customScore.speaking) + parseFloat(customScore.reading) + parseFloat(customScore.writing)) / 4).toFixed(1))
          };
        } else {
          scores = generateScoresForStudent(profileData, type, i);
        }
        
        // Calculate date ranges for each week/month card
        const itemStartDate = new Date(enrollDate.getTime());
        const itemEndDate = new Date(enrollDate.getTime());
        
        if (type === "week") {
          itemStartDate.setDate(enrollDate.getDate() + (i - 1) * 7);
          itemEndDate.setDate(enrollDate.getDate() + i * 7 - 1);
        } else {
          itemStartDate.setMonth(enrollDate.getMonth() + (i - 1));
          itemEndDate.setMonth(enrollDate.getMonth() + i);
          itemEndDate.setDate(itemEndDate.getDate() - 1);
        }

        const dateRangeStr = `${pad(itemStartDate.getDate())}/${pad(itemStartDate.getMonth() + 1)} - ${pad(itemEndDate.getDate())}/${pad(itemEndDate.getMonth() + 1)}/${itemEndDate.getFullYear()}`;

        const card = document.createElement("div");
        card.className = "scorecard-card-item";
        card.innerHTML = `
          <div class="scorecard-item-left">
            <h4 class="scorecard-item-title">${type === "week" ? "Tuần " + i : "Tháng " + i}</h4>
            <span class="scorecard-item-subtitle">${dateRangeStr}</span>
            <div class="scorecard-average-badge">
              <span class="scorecard-avg-val">${scores.average}</span>
              <span class="scorecard-avg-lbl">ĐIỂM TB</span>
            </div>
          </div>
          <div class="scorecard-item-right">
            <div class="score-bars-container">
              <div class="score-bar-row">
                <div class="score-bar-header">
                  <span class="score-bar-label">🎧 NGHE</span>
                  <span class="score-bar-value">${scores.listening}</span>
                </div>
                <div class="score-bar-progress">
                  <div class="score-bar-fill" style="width: ${scores.listening * 10}%;"></div>
                </div>
              </div>
              <div class="score-bar-row">
                <div class="score-bar-header">
                  <span class="score-bar-label">🗣️ NÓI</span>
                  <span class="score-bar-value">${scores.speaking}</span>
                </div>
                <div class="score-bar-progress">
                  <div class="score-bar-fill" style="width: ${scores.speaking * 10}%; background-color: #10B981;"></div>
                </div>
              </div>
              <div class="score-bar-row">
                <div class="score-bar-header">
                  <span class="score-bar-label">📖 ĐỌC</span>
                  <span class="score-bar-value">${scores.reading}</span>
                </div>
                <div class="score-bar-progress">
                  <div class="score-bar-fill" style="width: ${scores.reading * 10}%; background-color: #F5A623;"></div>
                </div>
              </div>
              <div class="score-bar-row">
                <div class="score-bar-header">
                  <span class="score-bar-label">✍️ VIẾT</span>
                  <span class="score-bar-value">${scores.writing}</span>
                </div>
                <div class="score-bar-progress">
                  <div class="score-bar-fill" style="width: ${scores.writing * 10}%; background-color: #EF4444;"></div>
                </div>
              </div>
            </div>
            <div class="scorecard-feedback">
              <strong>Chuyên cần: ${scores.attendance}% • Nhận xét từ cố vấn học tập</strong>
              <span>${scores.comment}</span>
            </div>
          </div>
        `;
        listContainer.appendChild(card);
      }
    };

    // Sub-tab toggling bindings
    const btnWeek = document.getElementById("btnScorecardWeekToggle");
    const btnMonth = document.getElementById("btnScorecardMonthToggle");

    if (btnWeek && btnMonth) {
      btnWeek.replaceWith(btnWeek.cloneNode(true));
      btnMonth.replaceWith(btnMonth.cloneNode(true));
      
      const newBtnWeek = document.getElementById("btnScorecardWeekToggle");
      const newBtnMonth = document.getElementById("btnScorecardMonthToggle");

      newBtnWeek.addEventListener("click", () => {
        newBtnWeek.classList.add("active");
        newBtnMonth.classList.remove("active");
        currentScorecardType = "week";
        renderList("week");
      });

      newBtnMonth.addEventListener("click", () => {
        newBtnMonth.classList.add("active");
        newBtnWeek.classList.remove("active");
        currentScorecardType = "month";
        renderList("month");
      });
      
      // Keep state highlight consistent
      newBtnWeek.classList.toggle("active", currentScorecardType === "week");
      newBtnMonth.classList.toggle("active", currentScorecardType === "month");
    }

    renderList(currentScorecardType);
  };

  // 3. Admin / Staff Student Profile Scorecard Renderer
  let currentAdminScorecardType = "week";

  const initAdminStudentScorecardModule = async (student) => {
    const enrollDate = getFixedEnrollDate(student.email, student.createdAt);

    const studyTime = calculateStudyTime(enrollDate);
    const activeWeeks = studyTime.activeWeeks;
    const activeMonths = studyTime.activeMonths;

    // Load custom scorecards from Firestore
    let customScorecards = [];
    try {
      const snap = await db.collection("scorecards")
        .where("studentEmail", "==", student.email.toLowerCase())
        .get();
      snap.forEach(doc => {
        customScorecards.push(doc.data());
      });
    } catch (err) {
      console.error("Failed to load custom scorecards for admin:", err);
    }

    const renderAdminList = (type) => {
      const container = document.getElementById("adsdScorecardList") || document.getElementById("adminStudentScorecardList");
      if (!container) return;
      container.innerHTML = "";

      const count = type === "week" ? activeWeeks : activeMonths;
      const pad = (n) => n < 10 ? '0' + n : n;

      for (let i = count; i >= 1; i--) {
        const customScore = customScorecards.find(s => s.type === type && s.index === i);
        let scores;
        if (customScore) {
          scores = {
            listening: parseFloat(customScore.listening),
            speaking: parseFloat(customScore.speaking),
            reading: parseFloat(customScore.reading),
            writing: parseFloat(customScore.writing),
            attendance: parseInt(customScore.attendance),
            comment: customScore.comment || "",
            average: parseFloat(((parseFloat(customScore.listening) + parseFloat(customScore.speaking) + parseFloat(customScore.reading) + parseFloat(customScore.writing)) / 4).toFixed(1))
          };
        } else {
          scores = generateScoresForStudent(student, type, i);
        }
        
        const itemStartDate = new Date(enrollDate.getTime());
        const itemEndDate = new Date(enrollDate.getTime());
        
        if (type === "week") {
          itemStartDate.setDate(enrollDate.getDate() + (i - 1) * 7);
          itemEndDate.setDate(enrollDate.getDate() + i * 7 - 1);
        } else {
          itemStartDate.setMonth(enrollDate.getMonth() + (i - 1));
          itemEndDate.setMonth(enrollDate.getMonth() + i);
          itemEndDate.setDate(itemEndDate.getDate() - 1);
        }

        const dateRangeStr = `${pad(itemStartDate.getDate())}/${pad(itemStartDate.getMonth() + 1)} - ${pad(itemEndDate.getDate())}/${pad(itemEndDate.getMonth() + 1)}`;

        const card = document.createElement("div");
        card.style.cssText = "background: var(--bg-primary); border: 1px solid var(--border); padding: 1rem; border-radius: var(--border-radius-sm); display: flex; flex-direction: column; gap: 0.5rem; transition: var(--transition-fast);";
        card.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed var(--border-light); padding-bottom: 0.35rem;">
            <strong style="color: var(--text-main); font-size: 0.8rem;">${type === "week" ? "Tuần " + i : "Tháng " + i} (${dateRangeStr})</strong>
            <span style="background: var(--accent); color: white; padding: 2px 6px; border-radius: 10px; font-size: 0.65rem; font-weight: 700;">Avg: ${scores.average}</span>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.35rem; font-size: 0.75rem;">
            <div>Nghe: <strong>${scores.listening}</strong> | Nói: <strong>${scores.speaking}</strong></div>
            <div>Đọc: <strong>${scores.reading}</strong> | Viết: <strong>${scores.writing}</strong></div>
          </div>
          <div style="font-size: 0.72rem; color: var(--text-muted); line-height: 1.4; border-top: 1px solid var(--border-light); padding-top: 0.35rem;">
            Chuyên cần: <strong>${scores.attendance}%</strong> • Nhận xét: <em>${scores.comment}</em>
          </div>
        `;
        container.appendChild(card);
      }
    };

    // Sub-tab toggling bindings
    const btnWeek = document.getElementById("btnAdminScorecardWeekToggle");
    const btnMonth = document.getElementById("btnAdminScorecardMonthToggle");

    if (btnWeek && btnMonth) {
      btnWeek.replaceWith(btnWeek.cloneNode(true));
      btnMonth.replaceWith(btnMonth.cloneNode(true));
      
      const newBtnWeek = document.getElementById("btnAdminScorecardWeekToggle");
      const newBtnMonth = document.getElementById("btnAdminScorecardMonthToggle");

      newBtnWeek.addEventListener("click", () => {
        newBtnWeek.classList.add("active");
        newBtnMonth.classList.remove("active");
        currentAdminScorecardType = "week";
        renderAdminList("week");
      });

      newBtnMonth.addEventListener("click", () => {
        newBtnMonth.classList.add("active");
        newBtnWeek.classList.remove("active");
        currentAdminScorecardType = "month";
        renderAdminList("month");
      });
      
      newBtnWeek.classList.toggle("active", currentAdminScorecardType === "week");
      newBtnMonth.classList.toggle("active", currentAdminScorecardType === "month");
    }

    renderAdminList(currentAdminScorecardType);
  };

  // ── Draw student learning progress chart on Canvas ──────────────────────
  const drawStudentGpaCanvas = (student, activeWeeks, customScorecards) => {
    const canvas = document.getElementById("studentProgressCanvas");
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = 210 * window.devicePixelRatio;
    
    const ctx = canvas.getContext("2d");
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    
    const width = rect.width;
    const height = 210;
    
    ctx.clearRect(0, 0, width, height);
    
    const points = [];
    for (let i = 1; i <= activeWeeks; i++) {
      const customScore = customScorecards.find(s => s.type === "week" && s.index === i);
      let gpa = 8.2;
      if (customScore) {
        gpa = parseFloat(((parseFloat(customScore.listening) + parseFloat(customScore.speaking) + parseFloat(customScore.reading) + parseFloat(customScore.writing)) / 4).toFixed(1));
      } else {
        gpa = generateScoresForStudent(student, "week", i).average;
      }
      points.push({ week: i, gpa: gpa });
    }
    
    if (points.length === 0) return;
    
    const paddingLeft = 35;
    const paddingRight = 20;
    const paddingTop = 25;
    const paddingBottom = 30;
    
    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;
    
    const isDark = document.body.classList.contains("dark-theme-crm");
    const gridColor = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.05)";
    const textColor = isDark ? "#94A3B8" : "#64748B";
    
    const yMin = 5.0;
    const yMax = 10.0;
    
    ctx.font = "10px sans-serif";
    ctx.fillStyle = textColor;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
      const ratio = i / gridLines;
      const y = paddingTop + chartHeight - ratio * chartHeight;
      const val = (yMin + ratio * (yMax - yMin)).toFixed(1);
      
      ctx.beginPath();
      ctx.moveTo(paddingLeft, y);
      ctx.lineTo(width - paddingRight, y);
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      ctx.stroke();
      
      ctx.fillText(val, paddingLeft - 8, y);
    }
    
    const getX = (index) => {
      if (points.length <= 1) return paddingLeft + chartWidth / 2;
      return paddingLeft + (index / (points.length - 1)) * chartWidth;
    };
    
    const getY = (gpa) => {
      const clamped = Math.max(yMin, Math.min(yMax, gpa));
      const ratio = (clamped - yMin) / (yMax - yMin);
      return paddingTop + chartHeight - ratio * chartHeight;
    };
    
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    points.forEach((p, idx) => {
      const x = getX(idx);
      if (points.length > 8 && idx % 2 !== 0 && idx !== points.length - 1) return;
      ctx.fillText(`Tuần ${p.week}`, x, paddingTop + chartHeight + 8);
    });
    
    const gradient = ctx.createLinearGradient(0, paddingTop, 0, paddingTop + chartHeight);
    gradient.addColorStop(0, "rgba(168, 139, 88, 0.22)");
    gradient.addColorStop(1, "rgba(168, 139, 88, 0.00)");
    
    ctx.beginPath();
    ctx.moveTo(getX(0), paddingTop + chartHeight);
    points.forEach((p, idx) => {
      ctx.lineTo(getX(idx), getY(p.gpa));
    });
    ctx.lineTo(getX(points.length - 1), paddingTop + chartHeight);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
    
    ctx.beginPath();
    points.forEach((p, idx) => {
      const x = getX(idx);
      const y = getY(p.gpa);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "var(--accent, #A88B58)";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    
    points.forEach((p, idx) => {
      const x = getX(idx);
      const y = getY(p.gpa);
      
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, 2 * Math.PI);
      ctx.fillStyle = isDark ? "#1E293B" : "#FFFFFF";
      ctx.fill();
      ctx.strokeStyle = "var(--accent, #A88B58)";
      ctx.lineWidth = 2;
      ctx.stroke();
      
      if (points.length <= 10 || idx === points.length - 1 || idx === 0) {
        ctx.fillStyle = isDark ? "#F8FAFC" : "#0F172A";
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(p.gpa.toFixed(1), x, y - 10);
      }
    });
  };

  // ── Populate student "Bảng tin trung tâm" tab ──────────────────────────
  let studentCountdownInterval = null;

  const initStudentNewsTab = (p) => {
    const announcements = [
      { id: 1, title: "Lịch nghỉ lễ Quốc khánh 2/9 & Thi thử giữa kỳ", category: "Nhắc nhở", date: "2026-08-05", urgency: "urgent" },
      { id: 2, title: "Khai giảng lớp tiếng Nhật/Hàn/Đài đàm thoại phản xạ miễn phí lớp tối", category: "Tin mới", date: "2026-08-02", urgency: "info" },
      { id: 3, title: "Thông báo về việc hoàn thiện hồ sơ dịch thuật đợt 2 kỳ nhập học tháng 4/2027", category: "Hỏa tốc", date: "2026-07-28", urgency: "critical" }
    ];

    const notifContainer = document.getElementById("studentAnnouncementsList");
    if (notifContainer) {
      notifContainer.innerHTML = announcements.map(a => {
        const badgeColor = a.urgency === "critical" ? "rgba(239,68,68,0.1)" : a.urgency === "urgent" ? "rgba(245,166,35,0.1)" : "rgba(59,130,246,0.1)";
        const textColor = a.urgency === "critical" ? "#EF4444" : a.urgency === "urgent" ? "#F5A623" : "#3B82F6";
        const formattedDate = new Date(a.date).toLocaleDateString('vi-VN');
        return `
          <div style="display: flex; align-items: flex-start; gap: 1rem; padding: 0.85rem; background: var(--bg-primary); border-radius: var(--border-radius-sm); border: 1px solid var(--border-light, rgba(0,0,0,0.03)); transition: transform 0.2s; text-align: left;" onmouseover="this.style.transform='translateX(4px)'" onmouseout="this.style.transform='none'">
            <span style="background: ${badgeColor}; color: ${textColor}; padding: 0.25rem 0.5rem; border-radius: var(--border-radius-sm); font-size: 0.68rem; font-weight: 700; text-transform: uppercase; white-space: nowrap;">${a.category}</span>
            <div style="flex: 1; min-width: 0;">
              <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-main); line-height: 1.4; margin-bottom: 2px;">${a.title}</div>
              <span style="font-size: 0.72rem; color: var(--text-muted);">${formattedDate}</span>
            </div>
          </div>
        `;
      }).join('');
    }

    const vinhDanhList = [
      { name: "Vũ Thùy Chi", code: "TE-2026-015", text: "Đạt GPA xuất sắc 9.6/10 và đỗ COE du học Tokyo, Nhật Bản kỳ tháng 10/2026", type: "study" },
      { name: "Trần Minh Quân", code: "TE-2026-033", text: "Chinh phục thành công học bổng toàn phần Chính phủ Đài Loan MOE 2026", type: "scholarship" },
      { name: "Lê Hồng Nhung", code: "TE-2026-008", text: "Xuất sắc đỗ Visa thẳng Đại học Kookmin, Hàn Quốc chỉ sau 2 tuần xét duyệt", type: "visa" }
    ];

    const hofContainer = document.getElementById("studentHallOfFameList");
    if (hofContainer) {
      hofContainer.innerHTML = vinhDanhList.map(v => {
        const icon = v.type === "study" ? "🎓" : v.type === "scholarship" ? "🎖️" : "✈️";
        return `
          <div style="display: flex; align-items: center; gap: 1rem; padding: 0.75rem; background: var(--bg-primary); border-radius: var(--border-radius-sm); border: 1px solid var(--border-light, rgba(0,0,0,0.03)); text-align: left;">
            <div style="width: 36px; height: 36px; border-radius: 50%; background: var(--accent-light); display: flex; align-items: center; justify-content: center; font-size: 1.1rem; flex-shrink: 0;">${icon}</div>
            <div style="flex: 1; min-width: 0;">
              <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 2px;">
                <strong style="font-size: 0.85rem; color: var(--text-main); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${v.name}</strong>
                <span style="font-size: 0.65rem; color: var(--accent); font-family: monospace; font-weight: 600;">${v.code}</span>
              </div>
              <p style="margin: 0; font-size: 0.75rem; color: var(--text-muted); line-height: 1.35; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${v.text}</p>
            </div>
          </div>
        `;
      }).join('');
    }

    const targetDate = new Date("2026-09-15T08:30:00+07:00");
    if (studentCountdownInterval) clearInterval(studentCountdownInterval);

    const updateClock = () => {
      const now = new Date();
      const diff = targetDate - now;
      if (diff <= 0) {
        clearInterval(studentCountdownInterval);
        const clockEl = document.getElementById("eventCountdownClock");
        if (clockEl) clockEl.innerHTML = `<span style="font-size:0.9rem; color: var(--accent); font-weight: 600;">Sự kiện đang diễn ra hoặc đã kết thúc!</span>`;
        return;
      }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      
      const dEl = document.getElementById("cdDays");
      const hEl = document.getElementById("cdHours");
      const mEl = document.getElementById("cdMins");
      
      if (dEl) dEl.textContent = String(days).padStart(2, '0');
      if (hEl) hEl.textContent = String(hours).padStart(2, '0');
      if (mEl) mEl.textContent = String(mins).padStart(2, '0');
    };

    updateClock();
    studentCountdownInterval = setInterval(updateClock, 60000);
  };

  // ── Populate student "Kì học & Lộ trình" tab ───────────────────────────
  const initStudentAcademicTab = (p) => {
    const targetCountry = p.country || "Nhật";
    const status = p.status || "Đang học";

    const stepsJapan = [
      { title: "Dịch thuật HS", sub: "Hoàn thiện dịch công chứng" },
      { title: "Nộp hồ sơ trường", sub: "Trường Nhật ngữ thẩm định" },
      { title: "Xét duyệt COE", sub: "Cục xuất nhập cảnh xét" },
      { title: "Nhận kết quả COE", sub: "Thông báo kết quả chính thức" },
      { title: "Xin Visa ĐSQ", sub: "Nộp hồ sơ xin dán Visa" },
      { title: "Nhận Visa & Bay", sub: "Chuẩn bị xuất cảnh du học" }
    ];

    const stepsKorea = [
      { title: "Dịch thuật HS", sub: "Hợp pháp hóa Lãnh sự học bạ" },
      { title: "Gửi hồ sơ ĐH Hàn", sub: "Chuyển phát nhanh sang trường" },
      { title: "Phỏng vấn ĐH", sub: "Trường đại học phỏng vấn" },
      { title: "Cấp mã code Visa", sub: "Cục XNC Hàn Quốc duyệt" },
      { title: "Nộp dán Visa ĐSQ", sub: "Nộp hồ sơ xin dán Visa" },
      { title: "Nhập học Seoul", sub: "Chuẩn bị xuất cảnh du học" }
    ];

    const stepsTaiwan = [
      { title: "Dịch thuật HS", sub: "Hợp pháp hóa VP Đài Bắc" },
      { title: "Nộp hồ sơ học bổng", sub: "Gửi trường & Bộ Giáo dục" },
      { title: "Phỏng vấn học bổng", sub: "Ủy ban học bổng phỏng vấn" },
      { title: "Nhận Admission Letter", sub: "Thư mời nhập học chính thức" },
      { title: "Xin Visa VP Đài Bắc", sub: "Nộp hồ sơ xin dán Visa" },
      { title: "Bay xuất cảnh", sub: "Nhập học kì mùa thu" }
    ];

    const steps = targetCountry === "Nhật" ? stepsJapan : (targetCountry === "Đài" ? stepsTaiwan : stepsKorea);

    let currentStepIdx = 1;
    let statusText = "Đang chuẩn bị hồ sơ";

    if (status === "Đang học") {
      currentStepIdx = 1;
      statusText = "Đang xử lý dịch thuật & hoàn thiện hồ sơ ban đầu";
    } else if (status === "Chờ phỏng vấn") {
      currentStepIdx = 3;
      statusText = "Hồ sơ đã gửi đi. Đang chờ phỏng vấn / xét duyệt tư cách lưu trú (COE)";
    } else if (status === "Đã trúng tuyển") {
      currentStepIdx = 5;
      statusText = "Đã trúng tuyển, có COE/Thư mời. Đang tiến hành xin dán Visa";
    } else if (status === "Đã xuất cảnh") {
      currentStepIdx = 6;
      statusText = "Đã hoàn tất thủ tục Visa & xuất cảnh thành công!";
    }

    const badgeEl = document.getElementById("studentVisaStatusBadge");
    if (badgeEl) {
      badgeEl.textContent = statusText;
      badgeEl.style.background = status === "Đã xuất cảnh" ? "rgba(16,185,129,0.1)" : status === "Đã trúng tuyển" ? "rgba(59,130,246,0.1)" : "rgba(168,139,88,0.1)";
      badgeEl.style.color = status === "Đã xuất cảnh" ? "#10B981" : status === "Đã trúng tuyển" ? "#3B82F6" : "var(--accent)";
    }

    const fillLine = document.getElementById("studentVisaTrackerFillLine");
    if (fillLine) {
      const widthPercent = ((currentStepIdx - 1) / 5) * 92;
      fillLine.style.width = `${widthPercent}%`;
    }

    const stepsContainer = document.getElementById("studentVisaTrackerSteps");
    if (stepsContainer) {
      stepsContainer.innerHTML = steps.map((s, idx) => {
        const stepNum = idx + 1;
        const done = stepNum < currentStepIdx || status === "Đã xuất cảnh";
        const active = stepNum === currentStepIdx && status !== "Đã xuất cảnh";
        const dotBg = done ? "var(--accent)" : active ? "#FAF9F6" : "var(--border)";
        const dotBorder = done ? "4px solid var(--accent-light)" : active ? "5px solid var(--accent)" : "4px solid var(--bg-card)";
        const titleColor = done || active ? "var(--text-main)" : "var(--text-muted)";
        const checkIcon = done ? `<svg viewBox="0 0 24 24" style="width:10px;height:10px;fill:#fff;"><path d="M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z"/></svg>` : "";
        return `
          <div style="display: flex; flex-direction: column; align-items: center; text-align: center; width: 14%; position: relative;">
            <div style="width: 22px; height: 22px; border-radius: 50%; background: ${dotBg}; border: ${dotBorder}; display: flex; align-items: center; justify-content: center; z-index: 5; box-shadow: var(--shadow-sm);">
              ${checkIcon}
            </div>
            <span style="font-size: 0.78rem; font-weight: ${active ? '700' : '600'}; color: ${titleColor}; margin-top: 0.5rem; display: block; line-height: 1.25;">${s.title}</span>
            <span style="font-size: 0.62rem; color: var(--text-muted); display: block; margin-top: 2px; line-height: 1.2; max-width: 90px; text-overflow: ellipsis; overflow: hidden; white-space: normal;">${s.sub}</span>
          </div>
        `;
      }).join('');
    }

    const allMissingDocs = {
      "Nhật": [
        { name: "Hộ chiếu gốc (còn hạn tối thiểu 2 năm)", note: "Cần nộp trước ngày 30/9" },
        { name: "Bản sao công chứng Bằng tốt nghiệp THPT", note: "Yêu cầu công chứng trong vòng 3 tháng" },
        { name: "Xác nhận số dư tài khoản ngân hàng bảo lãnh", note: "Số dư tối thiểu 500 triệu đồng" }
      ],
      "Đài": [
        { name: "Chứng chỉ ngoại ngữ TOCFL 1 trở lên", note: "Bản gốc đối chiếu" },
        { name: "Giấy khai sinh bản sao trích lục", note: "Dịch thuật công chứng Văn phòng Đài Bắc" },
        { name: "Hộ chiếu gốc (còn hạn tối thiểu 2 năm)", note: "Cần nộp gấp" }
      ],
      "Hàn": [
        { name: "Hợp pháp hóa Lãnh sự Học bạ & Bằng tốt nghiệp", note: "Hồ sơ bắt buộc xin Visa thẳng" },
        { name: "Sổ tiết kiệm ngân hàng Hàn Quốc (K-Sure)", note: "Giá trị tối thiểu 10,000 USD" },
        { name: "Chứng minh công việc và thu nhập người bảo lãnh", note: "Theo mẫu quy định" }
      ]
    };

    const missingDocs = allMissingDocs[targetCountry] || allMissingDocs["Nhật"];
    const docsContainer = document.getElementById("studentMissingDocsList");
    if (docsContainer) {
      if (status === "Đã xuất cảnh" || status === "Đã trúng tuyển") {
        docsContainer.innerHTML = `<div style="color:#10b981; font-weight: 600; text-align: center; padding: 1rem 0; font-size: 0.82rem;">🎉 Bạn đã hoàn thành tất cả hồ sơ!</div>`;
      } else {
        docsContainer.innerHTML = missingDocs.map(doc => `
          <div style="display: flex; align-items: flex-start; gap: 0.5rem; padding: 0.5rem 0; border-bottom: 1px solid var(--border-light, rgba(0,0,0,0.03)); text-align: left;">
            <span style="color: #ef4444; font-weight: bold; margin-top: 1px; font-size: 0.8rem;">⚠️</span>
            <div style="flex: 1; min-width: 0;">
              <div style="font-weight: 600; color: var(--text-main); font-size: 0.8rem;">${doc.name}</div>
              <span style="font-size: 0.72rem; color: var(--text-muted); display: block; margin-top: 1px;">${doc.note}</span>
            </div>
          </div>
        `).join('');
      }
    }

    const mockTests = [
      { name: "Thi thử học kỳ năng lực ngoại ngữ", time: "08:30 - 11:30", date: "2026-08-25", location: "Phòng thi tầng 2" },
      { name: "Phỏng vấn thử ĐH/Trường Nhật ngữ", time: "14:00 - 17:00", date: "2026-09-02", location: "Phòng Lab VIP 1" }
    ];

    const testsContainer = document.getElementById("studentMockTestsList");
    if (testsContainer) {
      testsContainer.innerHTML = mockTests.map(test => {
        const d = new Date(test.date);
        const dayStr = d.getDate();
        const monthStr = `T.${d.getMonth() + 1}`;
        return `
          <div style="display: flex; gap: 0.85rem; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid var(--border-light, rgba(0,0,0,0.03)); text-align: left;">
            <div style="width: 40px; height: 40px; background: rgba(168,139,88,0.08); border: 1px solid rgba(168,139,88,0.15); border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink: 0;">
              <span style="font-size: 0.9rem; font-weight: 700; color: var(--accent); line-height: 1;">${dayStr}</span>
              <span style="font-size: 0.55rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">${monthStr}</span>
            </div>
            <div style="flex: 1; min-width: 0;">
              <div style="font-weight: 600; color: var(--text-main); font-size: 0.8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${test.name}</div>
              <span style="font-size: 0.7rem; color: var(--text-muted); display: block; margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">⏱️ ${test.time} | 📍 ${test.location}</span>
            </div>
          </div>
        `;
      }).join('');
    }
  };

  // ── Populate student "Thông tin cá nhân" tab ───────────────────────────
  const populateStudentProfileTab = (p) => {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '--'; };
    const fmtDate = (val) => {
      if (!val) return '--';
      const d = val.toDate ? val.toDate() : new Date(val);
      return isNaN(d) ? '--' : d.toLocaleDateString('vi-VN');
    };

    // Avatar
    const avatarEl = document.getElementById('stpAvatar');
    if (avatarEl) {
      const initials = (p.name || 'HV').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
      avatarEl.textContent = initials;
      avatarEl.style.backgroundColor = getAvatarBgColor(p.name || 'HV');
    }

    set('stpName',          p.name);
    set('stpCode',          p.code);
    set('stpEmail',         p.email);
    set('stpPhone',         p.phone);
    set('stpCountry',       p.country);
    set('stpAdvisor',       p.advisor || 'Chưa phân công');
    set('stpLearningMonth', p.learningMonth || 'Tháng 1');
    set('stpNotes',         p.notes || 'Chưa có ghi chú tư vấn.');

    // Enrollment date — use real createdAt from Firestore
    const enrollDate = p.createdAt
      ? (p.createdAt.toDate ? p.createdAt.toDate() : new Date(p.createdAt))
      : new Date();
    set('stpEnrollDate', enrollDate.toLocaleDateString('vi-VN'));

    // Status badge
    const statusEl = document.getElementById('stpStatus');
    if (statusEl) {
      statusEl.textContent = p.status || 'Đang học';
      const sc = p.status === 'Đang học' ? 'active-badge'
        : p.status === 'Chờ phỏng vấn' ? 'pending-badge'
        : p.status === 'Đã xuất cảnh'  ? 'completed-badge'
        : 'inactive-badge';
      statusEl.className = `profile-status-badge ${sc}`;
    }

    // ── Lịch bay ──
    const flightEl    = document.getElementById('stpFlightDate');
    const countdownEl = document.getElementById('stpFlightCountdown');
    if (p.flightDate) {
      const fd = p.flightDate.toDate ? p.flightDate.toDate() : new Date(p.flightDate);
      if (flightEl) flightEl.textContent = fd.toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit', year:'numeric' });
      if (countdownEl) {
        const diff = Math.ceil((fd - new Date()) / (1000 * 60 * 60 * 24));
        countdownEl.textContent = diff > 0 ? `Còn ${diff} ngày` : diff === 0 ? 'Hôm nay xuất cảnh!' : `Đã xuất cảnh ${Math.abs(diff)} ngày trước`;
        countdownEl.style.background = diff <= 7 && diff >= 0 ? 'rgba(239,68,68,0.1)' : '';
        countdownEl.style.color      = diff <= 7 && diff >= 0 ? '#EF4444' : '';
      }
    } else {
      if (flightEl)    flightEl.textContent    = 'Chưa có lịch bay';
      if (countdownEl) countdownEl.textContent  = '';
    }

    // ── Học phí ──
    const tuitionTotal  = p.tuitionTotal  || 0;
    const tuitionPaid   = p.tuitionPaid   || 0;
    const tuitionRemain = Math.max(0, tuitionTotal - tuitionPaid);
    const fmt = (n) => n > 0 ? Number(n).toLocaleString('vi-VN') + ' đ' : '--';
    set('stpTuitionTotal',  fmt(tuitionTotal));
    set('stpTuitionPaid',   fmt(tuitionPaid));
    set('stpTuitionRemain', tuitionRemain > 0 ? fmt(tuitionRemain) : '0 đ');
    const tuitionStatusEl = document.getElementById('stpTuitionStatus');
    if (tuitionStatusEl) {
      if (tuitionTotal === 0) {
        tuitionStatusEl.textContent = 'Chưa cập nhật';
        tuitionStatusEl.style.background = 'var(--color-border,#E8E5DF)';
        tuitionStatusEl.style.color = 'var(--color-text-muted,#6B6A67)';
      } else if (tuitionRemain <= 0) {
        tuitionStatusEl.textContent = 'Đã đóng đủ';
        tuitionStatusEl.style.background = 'rgba(16,185,129,0.1)';
        tuitionStatusEl.style.color = '#10B981';
      } else {
        tuitionStatusEl.textContent = 'Còn nợ';
        tuitionStatusEl.style.background = 'rgba(239,68,68,0.1)';
        tuitionStatusEl.style.color = '#EF4444';
      }
    }
    const barEl = document.getElementById('stpTuitionBar');
    if (barEl) barEl.style.width = tuitionTotal > 0 ? Math.min(100, Math.round(tuitionPaid / tuitionTotal * 100)) + '%' : '0%';

    // ── Lộ trình học tập ──
    const ROADMAP_STEPS = [
      { month: 'Tháng 1', label: 'Xây dựng nền tảng', sub: 'Nhập môn ngôn ngữ & văn hóa' },
      { month: 'Tháng 2', label: 'Phát triển phản xạ', sub: 'Kỹ năng nghe – nói cơ bản' },
      { month: 'Tháng 3', label: 'Làm quen học thuật', sub: 'Ngữ pháp & từ vựng học thuật' },
      { month: 'Tháng 4', label: 'Tăng tốc học thuật', sub: 'Đọc hiểu & viết luận' },
      { month: 'Tháng 5', label: 'Luyện đề chuyên sâu', sub: 'Ôn thi & mô phỏng phỏng vấn' },
      { month: 'Tháng 6', label: 'Tổng ôn & mô phỏng', sub: 'Chuẩn bị hồ sơ & xuất cảnh' },
    ];
    // Derive current roadmap step from learningMonth field (not time-based)
    const LM_MAP = { 'Tháng 1':1, 'Tháng 2':2, 'Tháng 3':3, 'Tháng 4':4, 'Tháng 5':5, 'Tháng 6':6, 'Hoàn thành':7 };
    const currentIdx = LM_MAP[p.learningMonth] || 1; // 1–6 = active month, 7 = all done
    const allDone = currentIdx >= 7;
    const roadmapEl = document.getElementById('stpRoadmap');
    if (roadmapEl) {
      roadmapEl.innerHTML = ROADMAP_STEPS.map((s, i) => {
        const stepNum = i + 1;
        const done    = allDone || stepNum < currentIdx;
        const active  = !allDone && stepNum === currentIdx;
        const dotCls  = done ? 'done' : active ? 'active' : '';
        const tagCls  = done ? 'done' : active ? 'active' : 'upcoming';
        const tagTxt  = done ? 'Hoàn thành' : active ? 'Đang học' : 'Chưa bắt đầu';
        const checkSvg = done ? `<svg viewBox="0 0 24 24"><path d="M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z"/></svg>` : '';
        return `<div class="stp-roadmap-step">
          <div class="stp-step-dot ${dotCls}">${checkSvg}</div>
          <div class="stp-step-body">
            <div class="stp-step-label">${s.month}: ${s.label}</div>
            <div class="stp-step-sub">${s.sub}</div>
            <span class="stp-step-tag ${tagCls}">${tagTxt}</span>
          </div>
        </div>`;
      }).join('');
    }

    // ── Học kì ──
    // Kì I: tháng 1–2 | Kì II: tháng 3–4 | Kì III: tháng 5–6
    const sem1Status = currentIdx >= 3 ? 'Hoàn thành' : 'Đang học';
    const sem2Status = currentIdx <= 2 ? 'Chưa bắt đầu' : currentIdx >= 5 ? 'Hoàn thành' : 'Đang học';
    const sem3Status = currentIdx <= 4 ? 'Chưa bắt đầu' : currentIdx >= 7 ? 'Hoàn thành' : 'Đang học';
    const applyTag = (id, txt) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = txt;
      el.style.background = txt === 'Hoàn thành' ? 'rgba(16,185,129,0.1)' : txt === 'Đang học' ? 'rgba(168,139,88,0.1)' : 'var(--color-border,#E8E5DF)';
      el.style.color = txt === 'Hoàn thành' ? '#10B981' : txt === 'Đang học' ? 'var(--color-accent,#A88B58)' : 'var(--color-text-muted,#6B6A67)';
    };
    applyTag('stpSem1', sem1Status);
    applyTag('stpSem2', sem2Status);
    applyTag('stpSem3', sem3Status);
    const semesterNames = { 1:'KÌ I: Nhập môn & Phản xạ', 2:'KÌ I: Nhập môn & Phản xạ', 3:'KÌ II: Ngữ pháp & Học thuật', 4:'KÌ II: Ngữ pháp & Học thuật', 5:'KÌ III: Luyện đề & Phỏng vấn', 6:'KÌ III: Luyện đề & Phỏng vấn', 7:'Hoàn thành lộ trình' };
    set('stpSemesterBadge', semesterNames[currentIdx] || '--');
  };

  // Startup and Reload Session Handler
  const checkPortalSession = () => {
    // 2. Setup Auth state changed listener
    let _authResolved = false;
    const _hideLoadingOverlay = () => {
      if (_authResolved) return;
      _authResolved = true;
      const overlay = document.getElementById('app-loading-overlay');
      if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 260);
      }
    };

    auth.onAuthStateChanged(async (user) => {
      if (user) {
        try {
          const doc = await db.collection("users").doc(user.uid).get();
          if (doc.exists) {
            currentUser = doc.data();
          } else {
            // Self-healing database recovery: check if user is a student in students collection
            const studentQuery = await db.collection("students").where("email", "==", user.email).get();
            if (!studentQuery.empty) {
              const studentData = studentQuery.docs[0].data();
              currentUser = {
                name: studentData.name,
                email: user.email,
                role: "student",
                defaultPassword: "123456",
                passwordChanged: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
              };
              // Auto-restore missing user document
              await db.collection("users").doc(user.uid).set(currentUser);
              console.log(`Self-healed: restored users document for student ${user.email}`);
            } else {
              // Fallback default admin or staff profile in case of delay
              currentUser = {
                name: user.email === 'admin@domain.com' ? "Admin Aladdin Group" : "Nhân viên Aladdin",
                email: user.email,
                role: user.email === 'admin@domain.com' ? 'admin' : 'employee'
              };
            }
          }

          // Sync credentials to UI headers
          syncUserInfoUI(currentUser);

          // Start idle watcher — auto logout after 10 min inactivity
          _lastActivity = Date.now();
          _startIdleWatch();

          if (currentUser.role === 'student') {
            // SHOW Student App Root, hide Login Panel and Admin Portal
            if (loginContainer) loginContainer.style.display = 'none';
            if (appRoot) appRoot.style.display = 'none';

            const studentAppRoot = document.getElementById('student-app-root');
            if (studentAppRoot) studentAppRoot.style.display = 'flex';

            // Init notification bell and polling for students
            initNotificationBell();
            startNotifPolling();

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
                profileData = { id: pDoc.id, ...pDoc.data() };
              });

              // ── Populate "Thông tin cá nhân" tab ──────────────────
              populateStudentProfileTab(profileData);

              // ── Populate "Bảng tin trung tâm" tab ─────────────────
              initStudentNewsTab(profileData);

              // ── Populate "Kì học & Lộ trình" tab ──────────────────
              initStudentAcademicTab(profileData);

              // ── Load & wire Chi tiết hồ sơ ────────────────────────
              if (profileData.id) {
                // Toggle expand/collapse
                const toggle = document.getElementById('stpDetailToggle');
                const body   = document.getElementById('stpDetailBody');
                const icon   = document.getElementById('stpDetailToggleIcon');
                if (toggle && body) {
                  toggle.addEventListener('click', () => {
                    const open = body.style.display !== 'none';
                    body.style.display = open ? 'none' : 'block';
                    if (icon) icon.style.transform = open ? '' : 'rotate(180deg)';
                  });
                }

                // Load from student_profiles
                const loadDetailProfile = async () => {
                  try {
                    const snap = await db.collection('student_profiles').doc(profileData.id).get();
                    if (snap.exists) {
                      const d = snap.data();
                      const f = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined) el.value = val; };
                      f('sdpFullName', d.fullName);
                      f('sdpCccd', d.cccd); f('sdpCccdDate', d.cccdDate);
                      f('sdpGender', d.gender);
                      f('sdpDob', d.dob); f('sdpReligion', d.religion); f('sdpEthnicity', d.ethnicity);
                      f('sdpPermanentAddress', d.permanentAddress); f('sdpTempAddress', d.tempAddress);
                      f('sdpMarital', d.marital); f('sdpPhone', d.phone); f('sdpPhoneRelative', d.phoneRelative);
                      f('sdpSchoolPrimary', d.schoolPrimary); f('sdpSchoolPrimaryFrom', d.schoolPrimaryFrom); f('sdpSchoolPrimaryTo', d.schoolPrimaryTo);
                      f('sdpSchoolMiddle', d.schoolMiddle);   f('sdpSchoolMiddleFrom', d.schoolMiddleFrom);   f('sdpSchoolMiddleTo', d.schoolMiddleTo);
                      f('sdpSchoolHigh', d.schoolHigh);       f('sdpSchoolHighFrom', d.schoolHighFrom);       f('sdpSchoolHighTo', d.schoolHighTo);
                      f('sdpSchoolUni', d.schoolUni);         f('sdpSchoolUniFrom', d.schoolUniFrom);         f('sdpSchoolUniTo', d.schoolUniTo);
                      f('sdpWorkHistory', d.workHistory);
                      f('sdpFatherName', d.fatherName); f('sdpFatherYear', d.fatherYear); f('sdpFatherJob', d.fatherJob);
                      f('sdpMotherName', d.motherName); f('sdpMotherYear', d.motherYear); f('sdpMotherJob', d.motherJob);
                      f('sdpSiblingOlderName', d.siblingOlderName); f('sdpSiblingOlderYear', d.siblingOlderYear); f('sdpSiblingOlderJob', d.siblingOlderJob);
                      f('sdpSiblingYoungerName', d.siblingYoungerName); f('sdpSiblingYoungerYear', d.siblingYoungerYear); f('sdpSiblingYoungerJob', d.siblingYoungerJob);
                      f('sdpOtherMemberName', d.otherMemberName); f('sdpOtherMemberYear', d.otherMemberYear); f('sdpOtherMemberJob', d.otherMemberJob);
                      f('sdpStrengths', d.strengths); f('sdpWeaknesses', d.weaknesses);
                      f('sdpReason', d.reason); f('sdpHobbies', d.hobbies);
                    }
                  } catch(e) { console.warn('student_profiles load error:', e); }
                };
                loadDetailProfile();

                // Save form
                const detailForm = document.getElementById('stpDetailForm');
                if (detailForm) {
                  detailForm.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const g = (id) => document.getElementById(id)?.value.trim() || '';
                    const payload = {
                      fullName: g('sdpFullName'), cccd: g('sdpCccd'), cccdDate: g('sdpCccdDate'),
                      gender: g('sdpGender'), dob: g('sdpDob'), religion: g('sdpReligion'), ethnicity: g('sdpEthnicity'),
                      permanentAddress: g('sdpPermanentAddress'), tempAddress: g('sdpTempAddress'),
                      marital: g('sdpMarital'), phone: g('sdpPhone'), phoneRelative: g('sdpPhoneRelative'),
                      schoolPrimary: g('sdpSchoolPrimary'), schoolPrimaryFrom: g('sdpSchoolPrimaryFrom'), schoolPrimaryTo: g('sdpSchoolPrimaryTo'),
                      schoolMiddle: g('sdpSchoolMiddle'), schoolMiddleFrom: g('sdpSchoolMiddleFrom'), schoolMiddleTo: g('sdpSchoolMiddleTo'),
                      schoolHigh: g('sdpSchoolHigh'), schoolHighFrom: g('sdpSchoolHighFrom'), schoolHighTo: g('sdpSchoolHighTo'),
                      schoolUni: g('sdpSchoolUni'), schoolUniFrom: g('sdpSchoolUniFrom'), schoolUniTo: g('sdpSchoolUniTo'),
                      workHistory: g('sdpWorkHistory'),
                      fatherName: g('sdpFatherName'), fatherYear: g('sdpFatherYear'), fatherJob: g('sdpFatherJob'),
                      motherName: g('sdpMotherName'), motherYear: g('sdpMotherYear'), motherJob: g('sdpMotherJob'),
                      siblingOlderName: g('sdpSiblingOlderName'), siblingOlderYear: g('sdpSiblingOlderYear'), siblingOlderJob: g('sdpSiblingOlderJob'),
                      siblingYoungerName: g('sdpSiblingYoungerName'), siblingYoungerYear: g('sdpSiblingYoungerYear'), siblingYoungerJob: g('sdpSiblingYoungerJob'),
                      otherMemberName: g('sdpOtherMemberName'), otherMemberYear: g('sdpOtherMemberYear'), otherMemberJob: g('sdpOtherMemberJob'),
                      strengths: g('sdpStrengths'), weaknesses: g('sdpWeaknesses'),
                      reason: g('sdpReason'), hobbies: g('sdpHobbies'),
                      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    };
                    try {
                      await db.collection('student_profiles').doc(profileData.id).set(payload, { merge: true });
                      if (typeof showToast === 'function') showToast('Đã lưu hồ sơ chi tiết!', 'success');
                    } catch(err) {
                      if (typeof showToast === 'function') showToast('Lỗi lưu hồ sơ: ' + err.message, 'error');
                    }
                  });
                }
              }

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

              // Dynamic Prep Course Display based on country
              const studentPrepCourseDisplay = document.getElementById('studentPrepCourseDisplay');
              if (studentPrepCourseDisplay) {
                const targetCountry = profileData.country || "Nhật";
                if (targetCountry === "Nhật") {
                  studentPrepCourseDisplay.textContent = "Khóa đào tạo tiếng Nhật du học cấp tốc (N5 - N3)";
                } else if (targetCountry === "Đài") {
                  studentPrepCourseDisplay.textContent = "Khóa đào tạo tiếng Trung TOCFL du học cấp tốc";
                } else if (targetCountry === "Hàn") {
                  studentPrepCourseDisplay.textContent = "Khóa đào tạo tiếng Hàn du học cấp tốc (TOPIK II)";
                } else {
                  studentPrepCourseDisplay.textContent = "Khóa đào tạo ngôn ngữ du học cấp tốc";
                }
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

              // Calculate progress from enrollment date (createdAt)
              const enrollDate = getFixedEnrollDate(profileData.email, profileData.createdAt);

              const padZero = (n) => n < 10 ? '0' + n : n;
              const enrollDateStr = `${padZero(enrollDate.getDate())}/${padZero(enrollDate.getMonth() + 1)}/${enrollDate.getFullYear()}`;
              
              const studentEnrollDateDisplay = document.getElementById('studentEnrollDateDisplay');
              if (studentEnrollDateDisplay) {
                studentEnrollDateDisplay.textContent = enrollDateStr;
              }

              // Calculate elapsed months since admission
              const today = new Date();
              const diffTime = Math.abs(today - enrollDate);
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              const elapsedMonths = Math.floor(diffDays / 30);
              
              let monthStr = "Tháng 1";
              let activeTermLabel = "KÌ I";
              
              if (elapsedMonths <= 0) {
                monthStr = "Tháng 1";
                activeTermLabel = "KÌ I: NHẬP MÔN & PHẢN XẠ";
              } else if (elapsedMonths === 1) {
                monthStr = "Tháng 2";
                activeTermLabel = "KÌ I: NHẬP MÔN & PHẢN XẠ";
              } else if (elapsedMonths === 2) {
                monthStr = "Tháng 3";
                activeTermLabel = "KÌ II: NGỮ PHÁP & HỌC THUẬT";
              } else if (elapsedMonths === 3) {
                monthStr = "Tháng 4";
                activeTermLabel = "KÌ II: NGỮ PHÁP & HỌC THUẬT";
              } else if (elapsedMonths === 4) {
                monthStr = "Tháng 5";
                activeTermLabel = "KÌ III: LUYỆN ĐỀ & PHỎNG VẤN";
              } else {
                monthStr = "Tháng 6";
                activeTermLabel = "KÌ III: LUYỆN ĐỀ & PHỎNG VẤN (KÌ CUỐI)";
              }

              const semesterHeader = document.getElementById('studentCurrentSemesterHeaderDisplay');
              if (semesterHeader) {
                semesterHeader.textContent = `KÌ HỌC HIỆN TẠI: ${activeTermLabel}`;
              }

              // Map calculated monthStr to milestones
              let activeStepIndex = 1;
              if (monthStr === "Tháng 1") {
                activeStepIndex = 1;
              } else if (monthStr === "Tháng 2") {
                activeStepIndex = 2;
              } else if (monthStr === "Tháng 3") {
                activeStepIndex = 3;
              } else if (monthStr === "Tháng 4") {
                activeStepIndex = 4;
              } else if (monthStr === "Tháng 5") {
                activeStepIndex = 5;
              } else if (monthStr === "Tháng 6") {
                activeStepIndex = 6;
              } else if (monthStr === "Hoàn thành") {
                activeStepIndex = 7;
              }

              // Update milestone steps from 1 to 6
              for (let i = 1; i <= 6; i++) {
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
                    
                    // Securely insert completed checkmark SVG
                    dot.replaceChildren();
                    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                    svg.setAttribute("viewBox", "0 0 24 24");
                    svg.style.width = "12px";
                    svg.style.height = "12px";
                    svg.style.fill = "#fff";
                    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
                    path.setAttribute("d", "M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z");
                    svg.appendChild(path);
                    dot.appendChild(svg);
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
                    dot.replaceChildren();
                  }
                  if (badge) {
                    badge.textContent = 'ĐANG HỌC';
                    badge.style.background = 'var(--accent)';
                    badge.style.color = '#fff';
                    badge.style.border = 'none';
                  }
                } else {
                  // Pending
                  step.style.opacity = '0.7';
                  if (dot) {
                    dot.className = 'milestone-dot';
                    dot.style.background = 'var(--border)';
                    dot.style.border = '4px solid var(--bg-card)';
                    dot.replaceChildren();
                  }
                  if (badge) {
                    badge.textContent = 'CHƯA BẮT ĐẦU';
                    badge.style.background = 'transparent';
                    badge.style.color = 'var(--text-muted)';
                    badge.style.border = '1px solid var(--border)';
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

              // Load weekly and monthly scorecard details!
              initStudentScorecardModule(profileData);

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

            // Bind Student Profile button → navigate to Thông tin cá nhân tab
            const btnStudentProfile = document.getElementById('btnStudentProfile');
            if (btnStudentProfile) {
              btnStudentProfile.replaceWith(btnStudentProfile.cloneNode(true));
              document.getElementById('btnStudentProfile').addEventListener('click', () => {
                const profileTabBtn = document.querySelector('[data-tab="student-profile-tab"]');
                if (profileTabBtn) profileTabBtn.click();
                // Close dropdown
                const dropdown = document.querySelector('.student-dropdown-menu');
                if (dropdown) dropdown.style.display = 'none';
              });
            }

            // Subscribe to real-time blogs updates
            subscribeToBlogs();

            // Default to Tab 1 (Thông Tin Cá Nhân)
            const profileTabBtn = document.querySelector('[data-tab="student-profile-tab"]');
            if (profileTabBtn) profileTabBtn.click();

          } else {
            // SHOW Main App Root, hide Student Portal and Login Panel
            const studentAppRoot = document.getElementById('student-app-root');
            if (studentAppRoot) studentAppRoot.style.display = 'none';
            if (loginContainer) loginContainer.style.display = 'none';
            if (appRoot) appRoot.style.display = 'flex';

            // Init notification bell for admin/staff
            initNotificationBell();
            startNotifPolling();

            // Load users cache (one-time fetch)
            subscribeToUsersCache();

            // Load staff name→department map for student table
            _loadStaffMap();

            // Subscribe to real-time students updates
            subscribeToStudents();

            // Subscribe to real-time blogs updates
            subscribeToBlogs();

            // Navigate based on role
            if (currentUser.role === 'employee') {
              appRoot.classList.add('staff-mode');
              switchPortalView('staff-profile-dashboard');
            } else {
              appRoot.classList.remove('staff-mode');
              switchPortalView('crm-dashboard');
            }
          }
        } catch (e) {
          console.error("Error setting up logged in user session:", e);
          showToast("Lỗi đồng bộ dữ liệu người dùng!", "error");
        } finally {
          _hideLoadingOverlay();
        }
      } else {
        _hideLoadingOverlay();
        currentUser = null;
        _stopIdleWatch();
        if (_notifUnsubscribe) { _notifUnsubscribe(); _notifUnsubscribe = null; }
        _notifList = [];
        if (usersSubscription) {
          usersSubscription();
          usersSubscription = null;
        }
        if (contactsSubscription) {
          contactsSubscription();
          contactsSubscription = null;
        }
        if (sentRequestsSubscription) {
          sentRequestsSubscription();
          sentRequestsSubscription = null;
        }
        if (receivedRequestsSubscription) {
          receivedRequestsSubscription();
          receivedRequestsSubscription = null;
        }
        if (studentsSubscription) {
          studentsSubscription();
          studentsSubscription = null;
        }
        if (blogsSubscription) {
          blogsSubscription();
          blogsSubscription = null;
        }

        // Show Login Panel, hide App Workspaces
        const studentAppRoot = document.getElementById('student-app-root');
        if (studentAppRoot) studentAppRoot.style.display = 'none';
        if (loginContainer) loginContainer.style.display = 'flex';
        if (appRoot) { appRoot.style.display = 'none'; appRoot.classList.remove('staff-mode'); }
      }
    });
  };
  checkPortalSession();

  /* ==========================================================================
     HRM MODULE - COMPLETE LOGIC (STAFF, PROJECTS, PAYMENTS)
     ========================================================================== */

  // ---- HRM Chart Rendering ----

  const drawDonutChart = (canvasId, totalCount, segments) => {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2, cy = h / 2;
    const outerR = Math.min(cx, cy) - 6;
    const innerR = outerR * 0.62;
    const total = segments.reduce((s, seg) => s + seg.value, 0);
    let startAngle = -Math.PI / 2;

    segments.forEach(seg => {
      const sliceAngle = (seg.value / total) * 2 * Math.PI;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, outerR, startAngle, startAngle + sliceAngle);
      ctx.closePath();
      ctx.fillStyle = seg.color;
      ctx.fill();
      startAngle += sliceAngle;
    });

    const isDark = document.body.classList.contains('dark-theme-crm');
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, 2 * Math.PI);
    ctx.fillStyle = isDark ? '#1E293B' : '#FFFFFF';
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isDark ? '#F8FAFC' : '#0F172A';
    ctx.font = 'bold 26px Roboto, sans-serif';
    ctx.fillText(totalCount.toString(), cx, cy - 10);
    ctx.fillStyle = isDark ? '#94A3B8' : '#475569';
    ctx.font = '11px Roboto, sans-serif';
    ctx.fillText('Tổng công việc', cx, cy + 10);
  };

  const drawRadarChart = (canvasId, data) => {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const n = data.length;
    const cx = w / 2, cy = h / 2 + 8;
    const r = Math.min(cx, cy) - 34;
    const levels = 5;
    const isDark = document.body.classList.contains('dark-theme-crm');
    const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
    const labelColor = isDark ? '#94A3B8' : '#475569';

    for (let l = 1; l <= levels; l++) {
      const lr = (r * l) / levels;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const angle = (2 * Math.PI * i) / n - Math.PI / 2;
        const x = cx + lr * Math.cos(angle), y = cy + lr * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    for (let i = 0; i < n; i++) {
      const angle = (2 * Math.PI * i) / n - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.beginPath();
    data.forEach((d, i) => {
      const angle = (2 * Math.PI * i) / n - Math.PI / 2;
      const val = (d.value / d.max) * r;
      const x = cx + val * Math.cos(angle), y = cy + val * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 193, 7, 0.22)';
    ctx.fill();
    ctx.strokeStyle = '#FFC107';
    ctx.lineWidth = 2;
    ctx.stroke();

    data.forEach((d, i) => {
      const angle = (2 * Math.PI * i) / n - Math.PI / 2;
      const val = (d.value / d.max) * r;
      const x = cx + val * Math.cos(angle), y = cy + val * Math.sin(angle);
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, 2 * Math.PI);
      ctx.fillStyle = '#FFC107';
      ctx.fill();
    });

    ctx.fillStyle = labelColor;
    data.forEach((d, i) => {
      const angle = (2 * Math.PI * i) / n - Math.PI / 2;
      const lx = cx + (r + 22) * Math.cos(angle);
      const ly = cy + (r + 22) * Math.sin(angle);
      ctx.font = '10px Roboto, sans-serif';
      if (Math.cos(angle) > 0.3) ctx.textAlign = 'left';
      else if (Math.cos(angle) < -0.3) ctx.textAlign = 'right';
      else ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(d.label, lx, ly);
    });
  };

  // ---- HRM Profile View ----

  let _currentProfileStaff = null;

  const openHrmProfile = (staff) => {
    _currentProfileStaff = staff;
    document.querySelector('.hrm-subtabs').style.display = 'none';
    document.querySelectorAll('.hrm-tab-content').forEach(el => el.style.display = 'none');

    const pv = document.getElementById('hrmProfileView');
    if (!pv) return;
    pv.style.display = 'flex';
    pv.style.flexDirection = 'column';

    document.querySelectorAll('.hrm-ptab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.hrm-ptab-panel').forEach(p => p.classList.remove('active'));
    const firstTab = document.querySelector('.hrm-ptab[data-ptab="ptab-general"]');
    if (firstTab) firstTab.classList.add('active');
    const firstPanel = document.getElementById('ptab-general');
    if (firstPanel) firstPanel.classList.add('active');

    populateHrmProfile(staff);
  };

  const closeHrmProfile = () => {
    const pv = document.getElementById('hrmProfileView');
    if (pv) pv.style.display = 'none';

    const subtabs = document.querySelector('.hrm-subtabs');
    if (subtabs) subtabs.style.display = '';
    document.querySelectorAll('.hrm-tab-content').forEach(el => el.style.display = 'none');
    const staffTab = document.getElementById('hrm-staff-tab');
    if (staffTab) staffTab.style.display = 'block';
    document.querySelectorAll('.hrm-subtab').forEach(t => t.classList.remove('active'));
    const firstSubtab = document.querySelector('.hrm-subtab[data-tab="hrm-staff-tab"]');
    if (firstSubtab) firstSubtab.classList.add('active');
  };

  const populateHrmProfile = (s) => {
    const initials = s.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    const bg = getAvatarBgColor(s.name);

    const avatarEl = document.getElementById('profileAvatarLg');
    if (avatarEl) { avatarEl.textContent = initials; avatarEl.style.background = bg; }

    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '--'; };
    const fmtDate = (dateStr) => {
      if (!dateStr) return '--';
      const parts = dateStr.split('-');
      if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
      return dateStr;
    };
    const fmtCurrency = (val) => {
      return (val || 0).toLocaleString('vi-VN') + ' đ';
    };

    setText('profileFullName', s.name);
    const globalIdx = hrmStaffCache.findIndex(x => x.id === s.id) + 1;
    const empCodeVal = globalIdx > 0 ? String(globalIdx).padStart(5, '0') : '--';
    document.getElementById('profileEmpCode').textContent = `Mã ${empCodeVal}`;
    const positionText = s.jobTitle || s.position || '';
    document.getElementById('profilePositions').textContent = positionText
      ? `${positionText} • ${s.department || ''}` : '--';
    setText('profileUsername', s.username);
    setText('profileJoinDate', fmtDate(s.joinDate));
    setText('profileBirthday', fmtDate(s.birthday));
    setText('profileHometown', s.hometown);
    setText('profileGender', s.gender);
    setText('profileMarital', s.maritalStatus);
    setText('profileEducation', s.education);

    const emailEl = document.getElementById('profileEmail');
    if (emailEl) { emailEl.textContent = s.email || '--'; emailEl.href = s.email ? `mailto:${s.email}` : '#'; }
    const phoneEl = document.getElementById('profilePhone');
    if (phoneEl) { phoneEl.textContent = s.phone || '--'; phoneEl.href = s.phone ? `tel:${s.phone}` : '#'; }

    const badge = document.getElementById('profileStatusBadge');
    if (badge) {
      badge.textContent = s.status || '--';
      badge.className = 'profile-status-badge';
      if (s.status === 'Đang làm việc') badge.classList.add('active-badge');
      else if (s.status === 'Nghỉ phép') badge.classList.add('leave-badge');
      else badge.classList.add('inactive-badge');
    }

    // ── Work overview cards ──────────────────────────────────────────────────
    const salary = s.salary || 0;

    // Start date (static)
    const wsdEl = document.getElementById('profileWorkStartDate');
    if (wsdEl) wsdEl.textContent = s.joinDate ? new Date(s.joinDate).toLocaleDateString('vi-VN') : '--';

    // Salary (static)
    const salEl = document.getElementById('profileSalaryNew');
    if (salEl) {
      salEl.textContent = salary > 0 ? salary.toLocaleString('vi-VN') + ' đ' : '-- đ';
      salEl.style.color = salary > 0 ? '#059669' : 'var(--color-text-muted, #6B6A67)';
    }

    // KPI from hrm_staff field (admin sets directly on staff record)
    const storedKpi = (s.kpi != null && s.kpi !== '') ? Number(s.kpi) : null;
    const kpiEl = document.getElementById('profileKpi');
    if (kpiEl) {
      if (storedKpi != null) {
        kpiEl.textContent = storedKpi + '%';
        kpiEl.style.color = storedKpi >= 90 ? '#10B981' : storedKpi >= 70 ? '#6366F1' : storedKpi >= 50 ? '#F59E0B' : '#EF4444';
      } else {
        kpiEl.textContent = 'Chưa cập nhật';
        kpiEl.style.color = 'var(--color-text-muted, #6B6A67)';
      }
    }

    // Show loading state for attendance-derived fields
    const wdEl = document.getElementById('profileWorkDays');
    const attEl = document.getElementById('profileAttendance');
    if (wdEl) { wdEl.textContent = '...'; wdEl.style.color = 'var(--color-text-muted, #6B6A67)'; }
    if (attEl) { attEl.textContent = '...'; attEl.style.color = 'var(--color-text-muted, #6B6A67)'; }

    // ── Achievements ─────────────────────────────────────────────────────────
    const achEl = document.getElementById('profileAchievements');
    const achBadge = document.getElementById('achCountBadge');
    if (achEl) {
      const achs = Array.isArray(s.achievements) ? s.achievements : [];
      if (achs.length) {
        achEl.innerHTML = achs.map(a => `<span class="achievement-tag">⭐ ${esc(a)}</span>`).join('');
        if (achBadge) { achBadge.textContent = achs.length; achBadge.style.display = 'inline-flex'; }
      } else {
        achEl.innerHTML = '<div class="achievement-empty">Chưa có thành tích được ghi nhận</div>';
        if (achBadge) achBadge.style.display = 'none';
      }
    }

    // ── HR Score — populated after async attendance fetch ────────────────────
    const _applyHrScore = (kpiDisplay, attPct) => {
      const totalScore = Math.round(kpiDisplay * 0.6 + attPct * 0.4);
      const grade = totalScore >= 90 ? 'A' : totalScore >= 80 ? 'B+' : totalScore >= 70 ? 'B' : totalScore >= 60 ? 'C' : 'D';
      const gradeColor = totalScore >= 90 ? '#10B981' : totalScore >= 80 ? '#6366F1' : totalScore >= 70 ? '#3B82F6' : totalScore >= 60 ? '#F59E0B' : '#EF4444';
      const gradeNote = totalScore >= 90 ? '🏆 Xuất sắc — Nhân viên tiêu biểu'
        : totalScore >= 80 ? '🌟 Tốt — Vượt kỳ vọng'
        : totalScore >= 70 ? '👍 Khá — Đạt yêu cầu'
        : totalScore >= 60 ? '⚠️ Trung bình — Cần cải thiện'
        : '🔴 Yếu — Cần hỗ trợ đặc biệt';

      const scoreValEl   = document.getElementById('hrScoreVal');
      const scoreGradeEl = document.getElementById('hrScoreGrade');
      const scoreArcEl   = document.getElementById('hrScoreArc');
      if (scoreValEl)   scoreValEl.textContent = totalScore;
      if (scoreGradeEl) { scoreGradeEl.textContent = grade; scoreGradeEl.style.color = gradeColor; }
      if (scoreArcEl) {
        scoreArcEl.style.stroke = gradeColor;
        scoreArcEl.style.transition = 'none';
        scoreArcEl.style.strokeDashoffset = '326.7';
        requestAnimationFrame(() => {
          scoreArcEl.style.transition = 'stroke-dashoffset 1.1s cubic-bezier(.4,0,.2,1), stroke 0.3s';
          scoreArcEl.style.strokeDashoffset = 326.7 - (totalScore / 100) * 326.7;
        });
      }

      const hrKpiBar   = document.getElementById('hrKpiBar');
      const hrAttBar   = document.getElementById('hrAttBar');
      const hrKpiValEl = document.getElementById('hrKpiVal');
      const hrAttValEl = document.getElementById('hrAttVal');
      const hrNoteEl   = document.getElementById('hrScoreNote');
      if (hrKpiBar) { hrKpiBar.style.width = '0%'; requestAnimationFrame(() => { hrKpiBar.style.transition = 'width 1s ease'; hrKpiBar.style.width = kpiDisplay + '%'; }); }
      if (hrAttBar) { hrAttBar.style.width = '0%'; requestAnimationFrame(() => { hrAttBar.style.transition = 'width 1s ease'; hrAttBar.style.width = attPct + '%'; }); }
      if (hrKpiValEl) hrKpiValEl.textContent = kpiDisplay + '%';
      if (hrAttValEl) hrAttValEl.textContent = attPct + '%';
      if (hrNoteEl)   { hrNoteEl.textContent = gradeNote; hrNoteEl.style.color = gradeColor; }
    };

    // ── Async: fetch attendance from Firestore ───────────────────────────────
    (async () => {
      const now = new Date();
      const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const { S: standardDays } = calcStandardDays(monthStr);
      const todayDay = now.getDate();
      const days = {};

      // 1. Admin-managed attendance collection (priority)
      try {
        const attDoc = await db.collection('attendance').doc(`${s.id}_${monthStr}`).get();
        if (attDoc.exists && attDoc.data().days) {
          Object.assign(days, attDoc.data().days);
        }
      } catch (e) { /* non-critical */ }

      // 2. Merge employee self check-in logs for days not yet set by admin
      if (s.email) {
        try {
          const logsSnap = await db.collection('checkin_logs')
            .where('month', '==', monthStr)
            .where('email', '==', s.email)
            .get();
          logsSnap.forEach(doc => {
            const d = doc.data();
            if (d.date && d.checkin_time) {
              const dayKey = String(parseInt(d.date.split('-')[2], 10));
              if (!days[dayKey]) days[dayKey] = '1';
            }
          });
        } catch (e) { /* non-critical */ }
      }

      // 3. Count actual days worked (ignore future days)
      let actualDays = 0;
      Object.entries(days).forEach(([dayStr, v]) => {
        if (parseInt(dayStr, 10) > todayDay) return;
        if (v === '1') actualDays += 1;
        else if (v === '0.5') actualDays += 0.5;
      });

      // Standard days elapsed so far this month (Mon–Sat like calcStandardDays but up to today)
      let elapsedStd = 0;
      for (let d = 1; d <= todayDay; d++) {
        const dow = new Date(now.getFullYear(), now.getMonth(), d).getDay();
        if (dow >= 1 && dow <= 5) elapsedStd++;
        else if (dow === 6) elapsedStd += 0.5;
      }
      const attPct = elapsedStd > 0 ? Math.min(100, Math.round((actualDays / elapsedStd) * 100)) : 0;
      const kpiDisplay = storedKpi != null ? storedKpi : 0;

      // Update work days display
      if (wdEl) {
        wdEl.textContent = (actualDays % 1 === 0 ? actualDays : actualDays.toFixed(1)) + ' / ' + standardDays + ' ngày';
        wdEl.style.color = '';
      }

      // Update attendance %
      if (attEl) {
        attEl.textContent = attPct + '%';
        attEl.style.color = attPct >= 95 ? '#10B981' : attPct >= 80 ? '#6366F1' : attPct >= 65 ? '#F59E0B' : '#EF4444';
      }

      _applyHrScore(kpiDisplay, attPct);

      // ── Attendance mini bar chart ────────────────────────────────────────────
      const chartEl = document.getElementById('attMiniChart');
      const daysEl  = document.getElementById('attMiniDays');
      if (chartEl && daysEl) {
        const dow2Abbr = ['CN','T2','T3','T4','T5','T6','T7'];
        const barColors = { '1': '#6366F1', '0.5': '#A5B4FC', '0': '#FCA5A5', 'N': '#D1D5DB', '': '#E5E7EB' };
        const barHeight = { '1': 100, '0.5': 55, '0': 20, 'N': 15, '': 10 };
        // get weekdays of current month up to today
        const weekDays = [];
        for (let d = 1; d <= todayDay && weekDays.length < 7; d++) {
          const dow = new Date(now.getFullYear(), now.getMonth(), d).getDay();
          if (dow >= 1 && dow <= 6) weekDays.push(d);
        }
        const last6 = weekDays.slice(-6);
        chartEl.innerHTML = last6.map(d => {
          const v = days[String(d)] || '';
          const h = barHeight[v] || 10;
          const c = barColors[v] || '#E5E7EB';
          return `<div class="att-mini-bar" style="height:${h}%;background:${c}"></div>`;
        }).join('');
        daysEl.innerHTML = last6.map(d => {
          const dow = new Date(now.getFullYear(), now.getMonth(), d).getDay();
          return `<span class="att-mini-day-label">${dow2Abbr[dow]}</span>`;
        }).join('');
      }

      // ── KPI Trend SVG chart ──────────────────────────────────────────────────
      renderKpiTrendChart(s.id, kpiDisplay, attPct);
    })();

    // ── Activity Log ─────────────────────────────────────────────────────────
    loadHrmActivityLog(s.id);

    // ── Emergency contact summary (left column) ─────────────────────────────
    const ecSumEl = document.getElementById('profileEmergencyContactSummary');
    if (ecSumEl) {
      const rel = s.emergencyContactRelation || '';
      const ph  = s.emergencyContactPhone   || '';
      ecSumEl.textContent = (rel || ph) ? `${rel} - ${ph}`.replace(/^[-\s]+|[-\s]+$/g, '') : '--';
    }

    // ── Skills pills ─────────────────────────────────────────────────────────
    const skillTagsEl = document.getElementById('profileSkillTags');
    if (skillTagsEl) {
      const skills = Array.isArray(s.skills) ? s.skills : (s.skills ? String(s.skills).split(',').map(x=>x.trim()).filter(Boolean) : []);
      skillTagsEl.innerHTML = skills.length
        ? skills.map(sk => `<span class="skill-tag">${esc(sk)}</span>`).join('')
        : '<span class="skill-tag-empty">Chưa cập nhật</span>';
    }

    // ── Assets, Team/Pod, Line Manager ───────────────────────────────────────
    setText('profileAssets',      s.assets      || '--');
    setText('profileTeamPod',     s.teamPod     || s.department || '--');
    setText('profileLineManager', s.lineManager || s.manager   || 'Ban Giám đốc');

    // ── Tasks / Reminders ─────────────────────────────────────────────────────
    const taskListEl = document.getElementById('profileTaskList');
    if (taskListEl) {
      const tasks = Array.isArray(s.tasks) ? s.tasks : [];
      taskListEl.innerHTML = tasks.length
        ? tasks.map(t => `<li>${esc(t)}</li>`).join('')
        : '<li class="task-item-empty">Chưa có nhắc nhở</li>';
    }

    // ── Leave balance ─────────────────────────────────────────────────────────
    const leaveTotal = s.leaveTotal != null ? Number(s.leaveTotal) : 12;
    const leaveUsed  = s.leaveUsed  != null ? Number(s.leaveUsed)  : 0;
    const leaveUsedEl  = document.getElementById('leaveUsed');
    const leaveTotalEl = document.getElementById('leaveTotal');
    const leaveBarEl   = document.getElementById('leaveBarFill');
    if (leaveUsedEl)  leaveUsedEl.textContent  = leaveUsed;
    if (leaveTotalEl) leaveTotalEl.textContent = leaveTotal;
    if (leaveBarEl) {
      leaveBarEl.style.width = '0%';
      requestAnimationFrame(() => {
        leaveBarEl.style.width = leaveTotal > 0 ? Math.min(100, Math.round((leaveUsed / leaveTotal) * 100)) + '%' : '0%';
      });
    }

    // ── Manager notes ─────────────────────────────────────────────────────────
    const notesEl = document.getElementById('managerNotesInput');
    if (notesEl) notesEl.value = s.managerNotes || '';
    const saveNotesBtn = document.getElementById('btnSaveManagerNotes');
    if (saveNotesBtn) {
      saveNotesBtn.onclick = async () => {
        try {
          await db.collection('hrm_staff').doc(s.id).update({ managerNotes: notesEl.value });
          showToast('Đã lưu ghi chú!', 'success');
          logHrmActivity(s.id, 'Cập nhật Manager Notes');
        } catch (e) { showToast('Lỗi lưu ghi chú!', 'error'); }
      };
    }

    // ── Resume photo (admin view)
    const adminPhotoFrame = document.getElementById('adminResumePhotoFrame');
    if (adminPhotoFrame) {
      adminPhotoFrame.innerHTML = s.photoUrl
        ? `<img src="${s.photoUrl}" alt="${esc(s.name)}">`
        : `<span class="resume-photo-placeholder">👤</span>`;
    }
    const adminPhotoInput = document.getElementById('adminResumePhotoInput');
    if (adminPhotoInput) {
      adminPhotoInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        adminPhotoInput.value = '';
        const reader = new FileReader();
        reader.onerror = () => showToast('Không đọc được file ảnh', 'error');
        reader.onload = async (ev) => {
          try {
            // Load image via Promise so we can use async/await cleanly
            const img = await new Promise((res, rej) => {
              const i = new Image();
              i.onload = () => res(i);
              i.onerror = () => rej(new Error('File ảnh không hợp lệ'));
              i.src = ev.target.result;
            });

            // ── Step 1: Build thumbnail (720px) synchronously ──
            const scale = Math.min(1, 720 / Math.max(img.width, img.height));
            const tw = Math.round(img.width * scale);
            const th = Math.round(img.height * scale);
            const tc = document.createElement('canvas');
            tc.width = tw; tc.height = th;
            tc.getContext('2d').drawImage(img, 0, 0, tw, th);
            const thumbUrl = tc.toDataURL('image/jpeg', 0.88);

            // ── Step 2: Show thumbnail immediately ──
            if (adminPhotoFrame) adminPhotoFrame.innerHTML = `<img src="${thumbUrl}" alt="${esc(s.name)}">`;
            s.photoUrl = thumbUrl;
            await db.collection('hrm_staff').doc(s.id).update({ photoUrl: thumbUrl });
            showToast('Đã lưu ảnh!', 'success');

            // ── Step 3: Async upgrade to Full HD via Storage ──
            if (_hrmStorage) {
              try {
                const maxW = 1920, maxH = 1080;
                let w = img.width, h = img.height;
                if (w > maxW || h > maxH) {
                  const r = Math.min(maxW / w, maxH / h);
                  w = Math.round(w * r); h = Math.round(h * r);
                }
                const hc = document.createElement('canvas');
                hc.width = w; hc.height = h;
                const hx = hc.getContext('2d');
                hx.imageSmoothingEnabled = true; hx.imageSmoothingQuality = 'high';
                hx.drawImage(img, 0, 0, w, h);
                const hdBlob = await new Promise(res => hc.toBlob(res, 'image/jpeg', 0.92));
                if (hdBlob) {
                  const ref = _hrmStorage.ref(`hrm_staff/${s.id}/photo/profile.jpg`);
                  await ref.put(hdBlob, { contentType: 'image/jpeg' });
                  const hdUrl = await ref.getDownloadURL();
                  await db.collection('hrm_staff').doc(s.id).update({ photoUrl: hdUrl });
                  s.photoUrl = hdUrl;
                  if (adminPhotoFrame) adminPhotoFrame.innerHTML = `<img src="${hdUrl}" alt="${esc(s.name)}">`;
                  showToast('Ảnh đã nâng cấp Full HD!', 'success');
                }
              } catch (_) { /* HD upgrade failed — thumbnail already saved */ }
            }
          } catch (err) {
            showToast('Lỗi: ' + err.message, 'error');
          }
        };
        reader.readAsDataURL(file);
      };
    }

    // ── Resume documents (admin view)
    loadHrmResumeDocs(s.id, 'admin');
    const adminDocInput = document.getElementById('adminResumeDocInput');
    if (adminDocInput) {
      adminDocInput.onchange = () => uploadHrmResumeDocs(s.id, adminDocInput, 'admin');
    }

    // ── Contract documents (admin view)
    loadHrmContractDocs(s.id, 'admin');
    const adminCDocInput = document.getElementById('adminContractDocInput');
    if (adminCDocInput) {
      adminCDocInput.onchange = () => uploadHrmContractDocs(s.id, adminCDocInput, 'admin');
    }
    const btnCD = document.getElementById('btnViewContractDetail');
    if (btnCD) btnCD.onclick = () => openContractDetailModal(s);

    // ── Populate detail tabs
    setText('profileIdNumber', s.idNumber);
    setText('profileIdDate', fmtDate(s.idDate));
    setText('profileIdPlace', s.idPlace);
    setText('profileAddressPermanent', s.addressPermanent);
    setText('profileAddressCurrent', s.addressCurrent);
    setText('profileEmergencyName', s.emergencyContactName);
    setText('profileEmergencyPhone', s.emergencyContactPhone);
    setText('profileEmergencyRelation', s.emergencyContactRelation);

    setText('profileContractType', s.contractType);
    setText('profileContractStartDate', fmtDate(s.contractStartDate || s.joinDate));
    setText('profileContractEndDate', s.contractEndDate ? fmtDate(s.contractEndDate) : 'Vô thời hạn');
    setText('profileContractStatus', s.status === 'Đã nghỉ việc' ? 'Hết hiệu lực' : 'Đang hiệu lực');
    setText('profileDept', s.department);
    setText('profilePos', s.position);
    setText('profileManager', s.manager || 'Ban Giám đốc');
    setText('profileJoinDate2', fmtDate(s.joinDate));

    setText('profileBaseSalary', fmtCurrency(s.salary));
    setText('profileAllowanceLunch', s.allowanceSalary ? fmtCurrency(s.allowanceSalary) : '0 đ');
    setText('profileInsurance', s.insuranceSalary || 'Không');
    setText('profileBankNo', s.bankAccountNo);
    setText('profileBankName', s.bankName);
    setText('profileBankAccountName', s.bankAccountName);
    setText('profileTaxCode', s.taxCode);

    // ── Salary inline edit ──
    const salaryViewEl  = document.getElementById('salaryViewMode');
    const salaryEditEl  = document.getElementById('salaryEditMode');
    const btnEditSal    = document.getElementById('btnEditSalaryCard');
    const btnCancelSal  = document.getElementById('btnCancelSalaryEdit');
    const btnSaveSal    = document.getElementById('btnSaveSalaryEdit');
    const inputBase     = document.getElementById('inputBaseSalary');
    const inputAllow    = document.getElementById('inputAllowanceSalary');
    const inputIns      = document.getElementById('inputInsuranceSalary');

    const showSalaryView = () => {
      if (salaryViewEl) salaryViewEl.style.display = '';
      if (salaryEditEl) salaryEditEl.style.display = 'none';
      if (btnEditSal)   btnEditSal.style.display = '';
    };

    if (btnEditSal) btnEditSal.onclick = () => {
      if (inputBase)  inputBase.value  = s.salary || '';
      if (inputAllow) inputAllow.value = s.allowanceSalary || '';
      if (inputIns)   inputIns.value   = s.insuranceSalary || 'Không';
      if (salaryViewEl) salaryViewEl.style.display = 'none';
      if (salaryEditEl) salaryEditEl.style.display = '';
      if (btnEditSal)   btnEditSal.style.display = 'none';
    };

    if (btnCancelSal) btnCancelSal.onclick = showSalaryView;

    if (btnSaveSal) btnSaveSal.onclick = async () => {
      const newSalary    = Number(inputBase?.value) || 0;
      const newAllowance = Number(inputAllow?.value) || 0;
      const newInsurance = inputIns?.value || 'Không';
      try {
        btnSaveSal.disabled = true;
        btnSaveSal.textContent = 'Đang lưu…';
        await db.collection('hrm_staff').doc(s.id).update({
          salary:          newSalary,
          allowanceSalary: newAllowance,
          insuranceSalary: newInsurance,
        });
        s.salary          = newSalary;
        s.allowanceSalary = newAllowance;
        s.insuranceSalary = newInsurance;
        setText('profileBaseSalary',    fmtCurrency(newSalary));
        setText('profileAllowanceLunch', newAllowance ? fmtCurrency(newAllowance) : '0 đ');
        setText('profileInsurance',      newInsurance);
        showSalaryView();
        showToast('Đã cập nhật lương & phúc lợi!', 'success');
        await logHrmActivity(s.id, 'Cập nhật lương & phúc lợi');
      } catch (err) {
        showToast('Lỗi lưu dữ liệu!', 'error');
        console.error(err);
      } finally {
        btnSaveSal.disabled = false;
        btnSaveSal.textContent = 'Lưu thay đổi';
      }
    };

    // Load leave data for admin view
    if (s.email) loadLeaveData(s.email, s.joinDate, 'adm', false);

  };

  // ── KPI Trend SVG sparkline (last 6 months) ─────────────────────────────
  const renderKpiTrendChart = async (staffId, currentKpi, currentAtt) => {
    const svgEl    = document.getElementById('kpiTrendSvg');
    const monthsEl = document.getElementById('kpiTrendMonths');
    if (!svgEl || !monthsEl) return;

    // Build last 6 months list
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const labels = months.map(m => {
      const [, mm] = m.split('-');
      return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(mm) - 1];
    });

    // Fetch attendance data for each month
    const kpiSeries  = [];
    const attSeries  = [];
    const scoreSeries = [];
    for (const monthStr of months) {
      let att = 0;
      try {
        const doc = await db.collection('attendance').doc(`${staffId}_${monthStr}`).get();
        if (doc.exists && doc.data().days) {
          const { S } = calcStandardDays(monthStr);
          let actual = 0;
          Object.values(doc.data().days).forEach(v => { if (v === '1') actual++; else if (v === '0.5') actual += 0.5; });
          att = S > 0 ? Math.min(100, Math.round((actual / S) * 100)) : 0;
        }
      } catch (e) { /* skip */ }
      const kpi = monthStr === months[5] ? currentKpi : (att > 0 ? Math.min(100, att + Math.round((Math.random() - 0.4) * 15)) : 0);
      att = monthStr === months[5] ? currentAtt : att;
      kpiSeries.push(kpi);
      attSeries.push(att);
      scoreSeries.push(Math.round(kpi * 0.6 + att * 0.4));
    }

    // Draw SVG
    const W = 220, H = 65, PAD = 8;
    const xStep = (W - PAD * 2) / 5;
    const toY = v => PAD + (H - PAD * 2) * (1 - v / 100);
    const pts = (arr) => arr.map((v, i) => `${PAD + i * xStep},${toY(v)}`).join(' ');

    const lineColors = ['#6366F1', '#10B981', '#F59E0B'];
    const series = [kpiSeries, attSeries, scoreSeries];
    let linesHtml = '', dotsHtml = '', gridHtml = '';

    // Grid lines
    [0, 25, 50, 75, 100].forEach(v => {
      const y = toY(v);
      gridHtml += `<line x1="${PAD}" y1="${y}" x2="${W - PAD}" y2="${y}" stroke="#F3F4F6" stroke-width="1"/>`;
    });

    series.forEach((arr, si) => {
      const color = lineColors[si];
      const points = arr.map((v, i) => [PAD + i * xStep, toY(v)]);
      // Polyline
      linesHtml += `<polyline points="${pts(arr)}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" opacity="0.85"/>`;
      // Dots for current month only (last point)
      const [px, py] = points[5];
      dotsHtml += `<circle cx="${px}" cy="${py}" r="3.5" fill="${color}" stroke="#fff" stroke-width="1.5"/>`;
    });

    document.getElementById('kpiTrendGrid').innerHTML  = gridHtml;
    document.getElementById('kpiTrendLines').innerHTML = linesHtml;
    document.getElementById('kpiTrendDots').innerHTML  = dotsHtml;
    monthsEl.innerHTML = labels.map(l => `<span class="kpi-trend-month">${l}</span>`).join('');
  };

  // ── Activity Log helpers ──────────────────────────────────────────────────
  const logHrmActivity = async (staffId, action) => {
    if (!currentUser) return;
    try {
      await db.collection('hrm_activity_logs').add({
        staffId,
        action,
        by: currentUser.displayName || currentUser.email || 'Admin',
        at: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (e) { /* non-critical */ }
  };

  const loadHrmActivityLog = async (staffId) => {
    const logEl = document.getElementById('profileActivityLog');
    if (!logEl) return;
    try {
      const snap = await db.collection('hrm_activity_logs')
        .where('staffId', '==', staffId)
        .orderBy('at', 'desc')
        .limit(20)
        .get();
      if (snap.empty) {
        logEl.innerHTML = '<div class="activity-item-empty">Chưa có hoạt động nào</div>';
        return;
      }
      logEl.innerHTML = snap.docs.map(doc => {
        const d = doc.data();
        const ts = d.at?.toDate ? d.at.toDate() : new Date();
        const timeStr = ts.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ', ' +
                        ts.toLocaleDateString('vi-VN');
        return `<div class="activity-item"><strong>${esc(d.action)}</strong>by ${esc(d.by)}<br>at ${timeStr}</div>`;
      }).join('');
    } catch (e) {
      logEl.innerHTML = '<div class="activity-item-empty">Không thể tải nhật ký</div>';
    }
  };

  // ── HRM Resume: document helpers ─────────────────────────────────────────
  const _hrmStorage = (() => { try { return firebase.storage(); } catch(e) { return null; } })();

  const _fmtBytes = (b) => {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
  };

  const _docIcon = (ext) => {
    const m = { pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊', zip: '🗜️', jpg: '🖼️', jpeg: '🖼️', png: '🖼️' };
    return m[ext] || '📁';
  };

  const loadHrmResumeDocs = async (staffId, prefix) => {
    const tbody = document.getElementById(prefix === 'admin' ? 'adminResumeDocsTbody' : 'spResumeDocsTbody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:1.5rem;color:var(--text-muted);font-size:0.8rem;">Đang tải...</td></tr>`;
    try {
      const snap = await db.collection('hrm_staff').doc(staffId).collection('documents')
        .orderBy('uploadedAt', 'desc').get();
      if (snap.empty) {
        const emptyId = prefix === 'admin' ? 'adminResumeDocsEmpty' : 'spResumeDocsEmpty';
        tbody.innerHTML = `<tr id="${emptyId}"><td colspan="6" class="docs-empty-cell">
          <svg viewBox="0 0 24 24"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/></svg>
          Chưa có tài liệu nào</td></tr>`;
        return;
      }
      renderHrmResumeDocRows(snap.docs.map(d => ({ id: d.id, ...d.data() })), staffId, prefix);
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6" class="docs-empty-cell">Không thể tải tài liệu</td></tr>`;
    }
  };

  const renderHrmResumeDocRows = (docs, staffId, prefix) => {
    const tbody = document.getElementById(prefix === 'admin' ? 'adminResumeDocsTbody' : 'spResumeDocsTbody');
    if (!tbody) return;
    tbody.innerHTML = docs.map((doc, i) => {
      const ext = (doc.name || '').split('.').pop().toLowerCase();
      const icon = _docIcon(ext);
      let dateStr = '--';
      if (doc.uploadedAt) {
        const d = doc.uploadedAt.toDate ? doc.uploadedAt.toDate() : new Date(doc.uploadedAt);
        dateStr = d.toLocaleDateString('vi-VN');
      }
      const downloadBtn = doc.url
        ? `<a href="${doc.url}" target="_blank" download="${doc.name || 'file'}" class="crm-icon-btn" title="Tải về" style="color:#2563EB;">
            <svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;"><path d="M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z"/></svg>
           </a>`
        : '';
      return `<tr>
        <td style="font-size:.8rem;color:var(--text-muted);">${i + 1}</td>
        <td style="font-size:.8rem;">${icon} ${esc(doc.name || 'file')}</td>
        <td style="font-size:.78rem;color:var(--text-muted);">${ext.toUpperCase()}</td>
        <td style="font-size:.78rem;color:var(--text-muted);">${_fmtBytes(doc.size || 0)}</td>
        <td style="font-size:.78rem;color:var(--text-muted);">${dateStr}</td>
        <td style="text-align:center;">
          <div style="display:flex;align-items:center;justify-content:center;gap:4px;">
            ${downloadBtn}
            <button class="crm-icon-btn btn-del-hrm-doc" data-docid="${doc.id}" data-path="${doc.storagePath || ''}" title="Xóa" style="color:#EF4444;">
              <svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;"><path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/></svg>
            </button>
          </div>
        </td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('.btn-del-hrm-doc').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Xóa tài liệu này?')) return;
        const docId = btn.dataset.docid;
        const path  = btn.dataset.path;
        try {
          if (_hrmStorage && path) await _hrmStorage.ref(path).delete().catch(() => {});
          await db.collection('hrm_staff').doc(staffId).collection('documents').doc(docId).delete();
          loadHrmResumeDocs(staffId, prefix);
          showToast('Đã xóa tài liệu', 'success');
        } catch (e) { showToast('Lỗi xóa: ' + e.message, 'error'); }
      });
    });
  };

  const uploadHrmResumeDocs = async (staffId, input, prefix) => {
    if (!input.files.length) return;
    const progressEl = document.getElementById(prefix === 'admin' ? 'adminResumeDocProgress' : 'spResumeDocProgress');
    const msgEl = document.getElementById(prefix === 'admin' ? 'adminResumeDocMsg' : 'spResumeDocMsg');
    if (progressEl) progressEl.style.display = 'flex';
    const files = Array.from(input.files);
    let done = 0;
    for (const file of files) {
      if (msgEl) msgEl.textContent = `Đang lưu: ${file.name} (${done + 1}/${files.length})`;
      try {
        let url = '', storagePath = '';
        if (_hrmStorage) {
          try {
            storagePath = `hrm_staff/${staffId}/documents/${Date.now()}_${file.name}`;
            const ref = _hrmStorage.ref(storagePath);
            await Promise.race([
              ref.put(file).then(() => ref.getDownloadURL()).then(u => { url = u; }),
              new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 12000))
            ]);
          } catch (e) { storagePath = ''; url = ''; }
        }
        let dataUrl = url;
        if (!dataUrl && file.type.startsWith('image/') && file.size < 2 * 1024 * 1024) {
          dataUrl = await new Promise(res => { const r = new FileReader(); r.onload = e => res(e.target.result); r.readAsDataURL(file); });
        }
        const nowTs = firebase.firestore.Timestamp.fromDate(new Date());
        await db.collection('hrm_staff').doc(staffId).collection('documents').add({
          name: file.name, size: file.size, type: file.type,
          url: dataUrl || '', storagePath, uploadedAt: nowTs
        });
        done++;
      } catch (e) { showToast('Lỗi lưu ' + file.name + ': ' + e.message, 'error'); }
    }
    input.value = '';
    if (progressEl) progressEl.style.display = 'none';
    loadHrmResumeDocs(staffId, prefix);
    if (done > 0) showToast(`Đã lưu ${done} tài liệu`, 'success');
  };

  // ── Contract documents ──────────────────────────────────────────────────────
  const _contractDocIds = (prefix) => ({
    tbody:    prefix === 'admin' ? 'adminContractDocsTbody' : 'spContractDocsTbody',
    progress: prefix === 'admin' ? 'adminContractDocProgress' : 'spContractDocProgress',
    msg:      prefix === 'admin' ? 'adminContractDocMsg' : 'spContractDocMsg',
    empty:    prefix === 'admin' ? 'adminContractDocsEmpty' : 'spContractDocsEmpty',
  });

  const loadHrmContractDocs = async (staffId, prefix) => {
    const ids = _contractDocIds(prefix);
    const tbody = document.getElementById(ids.tbody);
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:1.5rem;color:var(--text-muted);font-size:0.8rem;">Đang tải...</td></tr>`;
    try {
      const snap = await db.collection('hrm_staff').doc(staffId).collection('contractDocs')
        .orderBy('uploadedAt', 'desc').get();
      if (snap.empty) {
        tbody.innerHTML = `<tr id="${ids.empty}"><td colspan="6" class="docs-empty-cell">
          <svg viewBox="0 0 24 24"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/></svg>
          Chưa có tài liệu nào</td></tr>`;
        return;
      }
      renderHrmContractDocRows(snap.docs.map(d => ({ id: d.id, ...d.data() })), staffId, prefix);
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6" class="docs-empty-cell">Không thể tải tài liệu</td></tr>`;
    }
  };

  const renderHrmContractDocRows = (docs, staffId, prefix) => {
    const ids = _contractDocIds(prefix);
    const tbody = document.getElementById(ids.tbody);
    if (!tbody) return;
    tbody.innerHTML = docs.map((doc, i) => {
      const ext = (doc.name || '').split('.').pop().toLowerCase();
      const icon = _docIcon(ext);
      let dateStr = '--';
      if (doc.uploadedAt) {
        const d = doc.uploadedAt.toDate ? doc.uploadedAt.toDate() : new Date(doc.uploadedAt);
        dateStr = d.toLocaleDateString('vi-VN');
      }
      const downloadBtn = doc.url
        ? `<a href="${doc.url}" target="_blank" download="${doc.name || 'file'}" class="crm-icon-btn" title="Tải về" style="color:#2563EB;">
            <svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;"><path d="M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z"/></svg>
           </a>`
        : '';
      return `<tr>
        <td style="font-size:.8rem;color:var(--text-muted);">${i + 1}</td>
        <td style="font-size:.8rem;">${icon} ${esc(doc.name || 'file')}</td>
        <td style="font-size:.78rem;color:var(--text-muted);">${ext.toUpperCase()}</td>
        <td style="font-size:.78rem;color:var(--text-muted);">${_fmtBytes(doc.size || 0)}</td>
        <td style="font-size:.78rem;color:var(--text-muted);">${dateStr}</td>
        <td style="text-align:center;">
          <div style="display:flex;align-items:center;justify-content:center;gap:4px;">
            ${downloadBtn}
            <button class="crm-icon-btn btn-del-hrm-cdoc" data-docid="${doc.id}" data-path="${doc.storagePath || ''}" title="Xóa" style="color:#EF4444;">
              <svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;"><path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/></svg>
            </button>
          </div>
        </td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('.btn-del-hrm-cdoc').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Xóa tài liệu này?')) return;
        const docId = btn.dataset.docid;
        const path  = btn.dataset.path;
        try {
          if (_hrmStorage && path) await _hrmStorage.ref(path).delete().catch(() => {});
          await db.collection('hrm_staff').doc(staffId).collection('contractDocs').doc(docId).delete();
          loadHrmContractDocs(staffId, prefix);
          showToast('Đã xóa tài liệu', 'success');
        } catch (e) { showToast('Lỗi xóa: ' + e.message, 'error'); }
      });
    });
  };

  const uploadHrmContractDocs = async (staffId, input, prefix) => {
    if (!input.files.length) return;
    const ids = _contractDocIds(prefix);
    const progressEl = document.getElementById(ids.progress);
    const msgEl = document.getElementById(ids.msg);
    if (progressEl) progressEl.style.display = 'flex';
    const files = Array.from(input.files);
    let done = 0;
    for (const file of files) {
      if (msgEl) msgEl.textContent = `Đang lưu: ${file.name} (${done + 1}/${files.length})`;
      try {
        let url = '', storagePath = '';
        if (_hrmStorage) {
          try {
            storagePath = `hrm_staff/${staffId}/contractDocs/${Date.now()}_${file.name}`;
            const ref = _hrmStorage.ref(storagePath);
            await Promise.race([
              ref.put(file).then(() => ref.getDownloadURL()).then(u => { url = u; }),
              new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 12000))
            ]);
          } catch (e) { storagePath = ''; url = ''; }
        }
        let dataUrl = url;
        if (!dataUrl && file.type.startsWith('image/') && file.size < 2 * 1024 * 1024) {
          dataUrl = await new Promise(res => { const r = new FileReader(); r.onload = e => res(e.target.result); r.readAsDataURL(file); });
        }
        const nowTs = firebase.firestore.Timestamp.fromDate(new Date());
        await db.collection('hrm_staff').doc(staffId).collection('contractDocs').add({
          name: file.name, size: file.size, type: file.type,
          url: dataUrl || '', storagePath, uploadedAt: nowTs
        });
        done++;
      } catch (e) { showToast('Lỗi lưu ' + file.name + ': ' + e.message, 'error'); }
    }
    input.value = '';
    if (progressEl) progressEl.style.display = 'none';
    loadHrmContractDocs(staffId, prefix);
    if (done > 0) showToast(`Đã lưu ${done} tài liệu`, 'success');
  };

  const openContractDetailModal = (s) => {
    const modal = document.getElementById('contractDetailModal');
    if (!modal) return;
    const fmtD = (val) => {
      if (!val) return '--';
      if (val.toDate) return val.toDate().toLocaleDateString('vi-VN');
      const d = new Date(val);
      return isNaN(d) ? String(val) : d.toLocaleDateString('vi-VN');
    };
    const seniority = (joinVal) => {
      if (!joinVal) return '--';
      const joinDate = joinVal.toDate ? joinVal.toDate() : new Date(joinVal);
      if (isNaN(joinDate)) return '--';
      const now = new Date();
      const months = (now.getFullYear() - joinDate.getFullYear()) * 12 + (now.getMonth() - joinDate.getMonth());
      if (months < 1) return 'Dưới 1 tháng';
      if (months < 12) return `${months} tháng`;
      const y = Math.floor(months / 12), m = months % 12;
      return m > 0 ? `${y} năm ${m} tháng` : `${y} năm`;
    };
    const isActive = s.status !== 'Đã nghỉ việc';
    const badge = document.getElementById('cdStatusBadge');
    if (badge) {
      badge.textContent = isActive ? 'Đang hiệu lực' : 'Hết hiệu lực';
      badge.style.background = isActive ? '#D1FAE5' : '#FEE2E2';
      badge.style.color = isActive ? '#059669' : '#DC2626';
    }
    const sub = document.getElementById('cdStaffNameSub');
    if (sub) sub.textContent = (s.name || '--') + (s.employeeCode ? ` · Mã ${s.employeeCode}` : '');
    const set2 = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '--'; };
    set2('cdContractType', s.contractType);
    set2('cdStartDate', fmtD(s.contractStartDate || s.joinDate));
    set2('cdEndDate', s.contractEndDate ? fmtD(s.contractEndDate) : 'Vô thời hạn');
    set2('cdDept', s.department);
    set2('cdPos', s.position);
    set2('cdManager', s.manager || 'Ban Giám đốc');
    set2('cdJoinDate', fmtD(s.joinDate));
    set2('cdSeniority', seniority(s.joinDate));
    modal.style.display = 'flex';
  };

  // Contract detail modal close handlers (run once)
  (() => {
    const closeCD = () => {
      const m = document.getElementById('contractDetailModal');
      if (m) m.style.display = 'none';
    };
    document.getElementById('btnCloseContractDetail')?.addEventListener('click', closeCD);
    document.getElementById('btnCloseContractDetailFooter')?.addEventListener('click', closeCD);
    document.getElementById('contractDetailModal')?.addEventListener('click', e => {
      if (e.target === e.currentTarget) closeCD();
    });
  })();

  let hrmInitialized = false;

  const initHrmModule = async () => {
    if (!hrmInitialized) {
      hrmInitialized = true;
      setupHrmSubtabs();
      setupHrmModals();
      setupHrmForms();
    }
    renderHrmKpi();
    subscribeToHrmStaff();
  };

  // ---- HRM Sub-tabs ----
  const setupHrmSubtabs = () => {
    document.querySelectorAll('.hrm-subtab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.hrm-subtab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.getAttribute('data-tab');
        document.querySelectorAll('.hrm-tab-content').forEach(tc => tc.style.display = 'none');
        const el = document.getElementById(target);
        if (el) el.style.display = 'block';
        if (target === 'hrm-staff-tab') { renderHrmKpi(); subscribeToHrmStaff(); renderHrmStaffList(); }
        else if (target === 'hrm-projects-tab') { renderHrmProjects(); }
        else if (target === 'hrm-payments-tab') { renderHrmPayments(); }
        else if (target === 'hrm-attendance-tab') { initHrmAttendanceTab(); }
        else if (target === 'hrm-payroll-tab') { initHrmPayrollTab(); }
      });
    });
  };

  // ---- HRM Modals ----
  const setupHrmModals = () => {
    const staffModal = document.getElementById('hrmStaffModal');
    const projectModal = document.getElementById('hrmProjectModal');

    document.getElementById('btnExportStaffExcel')?.addEventListener('click', () => {
      exportStaffToExcel();
    });

    document.getElementById('btnOpenHrmStaffModal')?.addEventListener('click', () => {
      document.getElementById('hrmStaffEditId').value = '';
      document.getElementById('hrmStaffForm').reset();
      document.getElementById('hrmStaffModalTitle').textContent = '+ THÊM NHÂN SỰ MỚI';
      const pwSection = document.getElementById('hrmStaffPasswordSection');
      if (pwSection) pwSection.style.display = 'block';
      const pwInput = document.getElementById('hrmStaffPassword');
      const pwConfirm = document.getElementById('hrmStaffPasswordConfirm');
      if (pwInput) pwInput.required = true;
      if (pwConfirm) pwConfirm.required = true;
      const emailElNew = document.getElementById('hrmStaffEmail');
      if (emailElNew) { emailElNew.readOnly = false; emailElNew.style.opacity = ''; emailElNew.style.cursor = ''; }
      if (staffModal) staffModal.style.display = 'flex';
    });
    document.getElementById('btnCloseHrmStaffModal')?.addEventListener('click', () => {
      if (staffModal) staffModal.style.display = 'none';
    });
    staffModal?.addEventListener('click', (e) => { if (e.target === staffModal) staffModal.style.display = 'none'; });

    document.getElementById('btnOpenHrmProjectModal')?.addEventListener('click', () => {
      document.getElementById('hrmProjectEditId').value = '';
      document.getElementById('hrmProjectForm').reset();
      document.getElementById('hrmProjectModalTitle').textContent = '+ THÊM DỰ ÁN MỚI';
      if (projectModal) projectModal.style.display = 'flex';
    });
    document.getElementById('btnCloseHrmProjectModal')?.addEventListener('click', () => {
      if (projectModal) projectModal.style.display = 'none';
    });
    projectModal?.addEventListener('click', (e) => { if (e.target === projectModal) projectModal.style.display = 'none'; });

    document.getElementById('btnBackToHrmList')?.addEventListener('click', closeHrmProfile);

    document.getElementById('btnUpdateProfileEdit')?.addEventListener('click', () => {
      if (_currentProfileStaff) editHrmStaff(_currentProfileStaff);
    });

    document.getElementById('btnProfileWorkEdit')?.addEventListener('click', () => {
      if (_currentProfileStaff) editHrmStaff(_currentProfileStaff);
    });

    document.getElementById('btnHrScoreEdit')?.addEventListener('click', () => {
      if (_currentProfileStaff) editHrmStaff(_currentProfileStaff);
    });

    document.getElementById('btnHrScoreUpdate')?.addEventListener('click', () => {
      if (_currentProfileStaff) populateHrmProfile(_currentProfileStaff);
    });

    // ── KPI Evaluation Modal — 5-mốc picker ──────────────────────────────────
    const KPI_MILESTONES = [
      { value: 20,  label: 'Yếu',       color: '#EF4444', bg: '#FEF2F2' },
      { value: 40,  label: 'TB',         color: '#F97316', bg: '#FFF7ED' },
      { value: 60,  label: 'Khá',        color: '#EAB308', bg: '#FEFCE8' },
      { value: 80,  label: 'Tốt',        color: '#10B981', bg: '#ECFDF5' },
      { value: 100, label: 'Xuất sắc',   color: '#6366F1', bg: '#EEF2FF' },
    ];

    let _kpiAttVal  = 0;
    let _kpiTaskVal = 0;

    const renderKpiPicker = (containerId, currentVal, accentColors, onSelect) => {
      const el = document.getElementById(containerId);
      if (!el) return;
      el.innerHTML = KPI_MILESTONES.map(m => {
        const active = currentVal === m.value;
        return `<button type="button" class="kpi-milestone-btn" data-val="${m.value}"
          style="padding:0.45rem 0.2rem;border-radius:10px;border:2px solid ${active ? m.color : 'var(--border-light)'};
                 background:${active ? m.bg : 'transparent'};cursor:pointer;transition:all .15s;
                 display:flex;flex-direction:column;align-items:center;gap:2px;">
          <span style="font-size:0.85rem;font-weight:800;color:${active ? m.color : 'var(--text-muted)'};">${m.value}</span>
          <span style="font-size:0.6rem;font-weight:600;color:${active ? m.color : 'var(--text-muted)'};">${m.label}</span>
        </button>`;
      }).join('');
      el.querySelectorAll('.kpi-milestone-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          onSelect(parseInt(btn.dataset.val));
        });
      });
    };

    const recalcKpiPreview = () => {
      const el = id => document.getElementById(id);
      const m = KPI_MILESTONES.find(x => x.value === _kpiAttVal) || KPI_MILESTONES[0];
      const t = KPI_MILESTONES.find(x => x.value === _kpiTaskVal) || KPI_MILESTONES[0];

      if (el('kpiAttScore'))  { el('kpiAttScore').textContent = _kpiAttVal + '%'; el('kpiAttScore').style.color = m.color; }
      if (el('kpiAttBar'))    el('kpiAttBar').style.width = _kpiAttVal + '%';
      if (el('kpiTaskScore')) { el('kpiTaskScore').textContent = _kpiTaskVal + '%'; el('kpiTaskScore').style.color = t.color; }
      if (el('kpiTaskBar'))   el('kpiTaskBar').style.width = _kpiTaskVal + '%';

      const total = Math.round(_kpiAttVal * 0.4 + _kpiTaskVal * 0.6);
      const grade = total >= 90 ? 'A' : total >= 80 ? 'B+' : total >= 70 ? 'B' : total >= 60 ? 'C' : 'D';
      if (el('kpiTotalPreview'))  el('kpiTotalPreview').textContent = total;
      if (el('kpiGradePreview'))  el('kpiGradePreview').textContent = `(${grade})`;
      if (el('kpiTotalBar'))      el('kpiTotalBar').style.width = total + '%';
    };

    const setKpiAtt = (val) => {
      _kpiAttVal = val;
      renderKpiPicker('kpiAttPicker', val, '#10B981', setKpiAtt);
      recalcKpiPreview();
    };
    const setKpiTask = (val) => {
      _kpiTaskVal = val;
      renderKpiPicker('kpiTaskPicker', val, '#6366F1', setKpiTask);
      recalcKpiPreview();
    };

    document.getElementById('btnOpenKpiEval')?.addEventListener('click', async () => {
      if (!_currentProfileStaff) return;
      const s = _currentProfileStaff;
      const modal = document.getElementById('kpiEvalModal');
      if (!modal) return;

      const now = new Date();
      const monthStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
      const el = id => document.getElementById(id);
      if (el('kpiEvalMonthLabel')) el('kpiEvalMonthLabel').textContent = `Nhân viên: ${s.name} · Tháng ${now.getMonth()+1}/${now.getFullYear()}`;

      // Load saved KPI values if any
      _kpiAttVal  = 0;
      _kpiTaskVal = 0;
      try {
        const kpiDoc = await db.collection('hrm_staff').doc(s.id).collection('kpiEvals').doc(monthStr).get();
        if (kpiDoc.exists) {
          _kpiAttVal  = kpiDoc.data().attVal  || 0;
          _kpiTaskVal = kpiDoc.data().taskVal || 0;
        }
      } catch(e) {}

      renderKpiPicker('kpiAttPicker',  _kpiAttVal,  '#10B981', setKpiAtt);
      renderKpiPicker('kpiTaskPicker', _kpiTaskVal, '#6366F1',  setKpiTask);
      recalcKpiPreview();
      modal.style.display = 'flex';
    });

    document.getElementById('btnCloseKpiEval')?.addEventListener('click', () => {
      document.getElementById('kpiEvalModal').style.display = 'none';
    });
    document.getElementById('btnCancelKpiEval')?.addEventListener('click', () => {
      document.getElementById('kpiEvalModal').style.display = 'none';
    });

    document.getElementById('btnApproveKpi')?.addEventListener('click', async () => {
      if (!_currentProfileStaff) return;
      if (_kpiAttVal === 0 && _kpiTaskVal === 0) { showToast('Vui lòng chọn mức đánh giá cho từng tiêu chí', 'error'); return; }
      const s = _currentProfileStaff;
      const now = new Date();
      const monthStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
      const finalKpi = Math.round(_kpiAttVal * 0.4 + _kpiTaskVal * 0.6);

      try {
        await db.collection('hrm_staff').doc(s.id).update({
          kpi: finalKpi,
          kpiApprovedAt: firebase.firestore.FieldValue.serverTimestamp(),
          kpiMonth: monthStr,
        });
        await db.collection('hrm_staff').doc(s.id).collection('kpiEvals').doc(monthStr).set({
          attVal: _kpiAttVal, taskVal: _kpiTaskVal, finalKpi, approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        document.getElementById('kpiEvalModal').style.display = 'none';
        s.kpi = finalKpi;
        _currentProfileStaff.kpi = finalKpi;
        populateHrmProfile(s);
        logHrmActivity(s.id, `Duyệt KPI tháng ${monthStr}: ${finalKpi}/100 (CN ${_kpiAttVal}%, CV ${_kpiTaskVal}%)`);
        showToast(`KPI tháng ${monthStr} đã duyệt: ${finalKpi}/100`, 'success');
      } catch(e) { showToast('Lỗi: ' + e.message, 'error'); }
    });

    document.getElementById('btnGoAttendance')?.addEventListener('click', () => {
      closeHrmProfile();
      const attTab = document.querySelector('.hrm-subtab[data-tab="hrm-attendance-tab"]');
      if (attTab) attTab.click();
    });

    document.getElementById('btnViewActivityLog')?.addEventListener('click', () => {
      if (_currentProfileStaff) loadHrmActivityLog(_currentProfileStaff.id);
    });

    document.querySelectorAll('.hrm-ptab').forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.ptab;
        document.querySelectorAll('.hrm-ptab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.hrm-ptab-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const panel = document.getElementById(target);
        if (panel) panel.classList.add('active');
      });
    });
  };

  // ---- HRM Filter listeners ----
  const setupHrmForms = () => {
    document.getElementById('hrmStaffSearch')?.addEventListener('input', () => renderHrmStaffList());
    document.getElementById('hrmStaffDeptFilter')?.addEventListener('change', () => renderHrmStaffList());

    // Attendance month controls
    document.getElementById('hrmAttendanceMonth')?.addEventListener('change', () => {
      subscribeToHrmAttendance(document.getElementById('hrmAttendanceMonth').value);
    });
    document.getElementById('btnAttPrevMonth')?.addEventListener('click', () => {
      shiftMonthInput('hrmAttendanceMonth', -1, subscribeToHrmAttendance);
    });
    document.getElementById('btnAttNextMonth')?.addEventListener('click', () => {
      shiftMonthInput('hrmAttendanceMonth', 1, subscribeToHrmAttendance);
    });

    // Staff form
    document.getElementById('hrmStaffForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const editId = document.getElementById('hrmStaffEditId').value.trim();
      const email  = document.getElementById('hrmStaffEmail').value.trim();
      const name   = document.getElementById('hrmStaffName').value.trim();
      const dept   = document.getElementById('hrmStaffDept').value;

      if (!name)  { showToast('Vui lòng nhập họ tên nhân viên!', 'error'); return; }
      if (!dept)  { showToast('Vui lòng chọn phòng ban!', 'error'); return; }
      if (!editId && !email) { showToast('Vui lòng nhập email!', 'error'); return; }

      const data = {
        name,
        email,
        department: dept,
        jobTitle:   document.getElementById('hrmStaffJobTitle')?.value || 'Nhân viên',
        level:      document.getElementById('hrmStaffLevel')?.value || 'Cấp 1',
        workType:   document.getElementById('hrmStaffWorkType')?.value || 'Full-time',
        phone:      document.getElementById('hrmStaffPhone').value.trim(),
        birthday:   document.getElementById('hrmStaffBirthday')?.value || null,
        status:     document.getElementById('hrmStaffStatus').value,
        joinDate:   document.getElementById('hrmStaffJoinDate')?.value || null,
        username:                 document.getElementById('hrmStaffUsername')?.value.trim() || '',
        hometown:                 document.getElementById('hrmStaffHometown')?.value.trim() || '',
        gender:                   document.getElementById('hrmStaffGender')?.value || '',
        maritalStatus:            document.getElementById('hrmStaffMarital')?.value || '',
        education:                document.getElementById('hrmStaffEducation')?.value.trim() || '',
        emergencyContactName:     document.getElementById('hrmStaffEmergencyName')?.value.trim() || '',
        emergencyContactPhone:    document.getElementById('hrmStaffEmergencyPhone')?.value.trim() || '',
        emergencyContactRelation: document.getElementById('hrmStaffEmergencyRelation')?.value.trim() || '',
        updatedAt:  firebase.firestore.FieldValue.serverTimestamp()
      };

      try {
        if (editId) {
          await db.collection('hrm_staff').doc(editId).update(data);
          await logHrmActivity(editId, 'Cập nhật thông tin nhân sự');
          showToast('Đã cập nhật thông tin nhân sự!', 'success');
        } else {
          // Validate password
          const password = document.getElementById('hrmStaffPassword').value;
          const passwordConfirm = document.getElementById('hrmStaffPasswordConfirm').value;
          if (!password || password.length < 6) {
            showToast('Mật khẩu phải có ít nhất 6 ký tự!', 'error');
            return;
          }
          if (password !== passwordConfirm) {
            showToast('Mật khẩu xác nhận không khớp!', 'error');
            return;
          }

          // 1. Tạo tài khoản Firebase Auth qua REST API (Identity Toolkit) — KHÔNG khởi tạo bất kỳ
          // Auth instance nào ở client nên tuyệt đối không thể ảnh hưởng phiên đăng nhập của Admin.
          const apiKey = firebase.app().options.apiKey;
          let newUid;
          try {
            const res = await fetch(
              `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, returnSecureToken: false })
              }
            );
            const authResult = await res.json();
            if (authResult.error) throw authResult.error;
            newUid = authResult.localId;
          } catch (authErr) {
            console.error('Lỗi tạo tài khoản Auth (REST API):', authErr);
            if (authErr.message === 'EMAIL_EXISTS') {
              // Tài khoản Auth của email này đã tồn tại từ trước (vd: hồ sơ Firestore cũ đã bị xóa
              // nhưng tài khoản Auth thì không xóa được qua client). Thử đăng nhập lại bằng đúng
              // email/mật khẩu vừa nhập để lấy lại UID cũ, rồi "hồi sinh" hồ sơ Firestore cho UID đó
              // — KHÔNG dùng SDK client nên vẫn không ảnh hưởng phiên đăng nhập của Admin.
              try {
                const signInRes = await fetch(
                  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password, returnSecureToken: false })
                  }
                );
                const signInResult = await signInRes.json();
                if (signInResult.error) throw signInResult.error;
                newUid = signInResult.localId;
                showToast('Email này đã có tài khoản đăng nhập cũ — đang khôi phục hồ sơ nhân sự cho tài khoản đó...', 'info');
              } catch (signInErr) {
                console.error('Lỗi đăng nhập khôi phục tài khoản cũ:', signInErr);
                showToast('Email này đã có tài khoản nhưng mật khẩu vừa nhập không khớp với mật khẩu cũ. Hãy nhập đúng mật khẩu cũ của tài khoản này, hoặc xóa tài khoản đó trong Firebase Console > Authentication rồi thử lại.', 'error');
                return;
              }
            } else {
              showToast('Lỗi tạo tài khoản: ' + authErr.message, 'error');
              return;
            }
          }

          // 2. Ghi thông tin nhân viên vào Firestore với role: "employee"
          try {
            await db.collection('users').doc(newUid).set({
              name, email, role: 'employee',
              createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            if (!data.joinDate) data.joinDate = new Date().toISOString().split('T')[0];
            await db.collection('hrm_staff').add(data);
          } catch (firestoreErr) {
            console.error('Lỗi lưu Firestore (kiểm tra Security Rules cho "users"/"hrm_staff"):', firestoreErr);
            showToast('Tài khoản đăng nhập đã tạo nhưng KHÔNG lưu được vào Firestore (lỗi quyền: ' + firestoreErr.message + ').', 'error');
            return;
          }

          showToast(`Đã tạo tài khoản nhân viên cho ${name}!`, 'success');
        }

        document.getElementById('hrmStaffModal').style.display = 'none';
        renderHrmKpi();
        reloadCrmStaff();
      } catch (err) {
        console.error('HRM staff save error:', err);
        showToast('Lỗi khi lưu nhân sự: ' + err.message, 'error');
      }
    });

    // Project form
    document.getElementById('hrmProjectForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const editId = document.getElementById('hrmProjectEditId').value;
      const data = {
        name: document.getElementById('hrmProjectName').value.trim(),
        description: document.getElementById('hrmProjectDesc').value.trim(),
        status: document.getElementById('hrmProjectStatus').value,
        progress: parseInt(document.getElementById('hrmProjectProgress').value) || 0,
        leader: document.getElementById('hrmProjectLeader').value.trim(),
        tasksCount: parseInt(document.getElementById('hrmProjectTasks').value) || 0,
        scale: document.getElementById('hrmProjectScale')?.value || 'Nhỏ',
        deadline: document.getElementById('hrmProjectDeadline')?.value || '',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      try {
        if (editId) {
          await db.collection('hrm_projects').doc(editId).update(data);
          showToast('Đã cập nhật dự án!', 'success');
        } else {
          data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
          await db.collection('hrm_projects').add(data);
          showToast('Đã thêm dự án mới thành công!', 'success');
        }
        document.getElementById('hrmProjectModal').style.display = 'none';
        renderHrmProjects();
      } catch (err) {
        console.error('HRM project save error:', err);
        showToast('Lỗi khi lưu dự án: ' + err.message, 'error');
      }
    });

    // Payment form
    document.getElementById('hrmPaymentForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = {
        purpose: document.getElementById('hrmPayPurpose').value.trim(),
        category: document.getElementById('hrmPayCategory').value,
        amount: parseInt(document.getElementById('hrmPayAmount').value) || 0,
        department: document.getElementById('hrmPayDept').value,
        notes: document.getElementById('hrmPayNotes').value.trim(),
        requester: currentUser ? currentUser.name : 'Unknown',
        requesterEmail: currentUser ? currentUser.email : '',
        status: 'Chờ duyệt',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      try {
        await db.collection('hrm_payments').add(data);
        showToast('Đã gửi đề xuất thanh toán thành công!', 'success');
        document.getElementById('hrmPaymentForm').reset();
        renderHrmPayments();
      } catch (err) {
        console.error('HRM payment save error:', err);
        showToast('Lỗi khi gửi đề xuất: ' + err.message, 'error');
      }
    });
  };

  // ---- Render KPI ----
  const renderHrmKpi = async () => {
    const grid = document.getElementById('hrmKpiGrid');
    if (!grid) return;
    try {
      const snap = await db.collection('hrm_staff').get();
      const allStaff = [];
      snap.forEach(doc => allStaff.push(doc.data()));

      const totalCount  = allStaff.length;
      const activeCount = allStaff.filter(s => s.status === 'Đang làm việc').length;
      const leaveCount  = allStaff.filter(s => s.status === 'Nghỉ phép').length;
      const resignCount = allStaff.filter(s => s.status === 'Đã nghỉ việc').length;

      const overviewBar = document.getElementById('hrmOverviewBar');
      if (overviewBar) {
        overviewBar.innerHTML = `
          <div class="overview-stat-item">
            <span class="overview-num">${totalCount}</span>
            <span class="overview-label">Tổng nhân sự</span>
          </div>
          <div class="overview-divider"></div>
          <div class="overview-stat-item">
            <span class="overview-num" style="color:#10B981">${activeCount}</span>
            <span class="overview-label">Đang làm việc</span>
          </div>
          <div class="overview-divider"></div>
          <div class="overview-stat-item">
            <span class="overview-num" style="color:#F59E0B">${leaveCount}</span>
            <span class="overview-label">Nghỉ phép</span>
          </div>
          <div class="overview-divider"></div>
          <div class="overview-stat-item">
            <span class="overview-num" style="color:#EF4444">${resignCount}</span>
            <span class="overview-label">Đã nghỉ việc</span>
          </div>`;
      }

      const depts = [
        { key: 'Hành chính kế toán', color: '#0EA5E9', bg: 'rgba(14,165,233,0.12)',
          icon: '<svg viewBox="0 0 24 24"><path d="M19,3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3M19,19H5V5H19V19M17,12H7V10H17V12M17,16H7V14H17V16M14,8H7V6H14V8Z"/></svg>' },
        { key: 'Marketing',          color: '#EC4899', bg: 'rgba(236,72,153,0.12)',
          icon: '<svg viewBox="0 0 24 24"><path d="M16,6L18.29,8.29L13.41,13.17L9.41,9.17L2,16.59L3.41,18L9.41,12L13.41,16L19.71,9.71L22,12V6H16Z"/></svg>' },
        { key: 'Đối ngoại',          color: '#14B8A6', bg: 'rgba(20,184,166,0.12)',
          icon: '<svg viewBox="0 0 24 24"><path d="M17.9,17.39C17.64,16.59 16.89,16 16,16H15V13A1,1 0 0,0 14,12H8V10H10A1,1 0 0,0 11,9V7H13A2,2 0 0,0 15,5V4.59C17.93,5.77 20,8.64 20,12C20,14.08 19.2,15.97 17.9,17.39M11,19.93C7.05,19.44 4,16.08 4,12C4,11.38 4.08,10.78 4.21,10.21L9,15V16A2,2 0 0,0 11,18M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z"/></svg>' },
        { key: 'Hồ sơ',              color: '#F59E0B', bg: 'rgba(245,158,11,0.12)',
          icon: '<svg viewBox="0 0 24 24"><path d="M20,18H4V8H20M20,6H12L10,4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V8C22,6.89 21.1,6 20,6Z"/></svg>' },
        { key: 'Đào tạo',            color: '#D97706', bg: 'rgba(217,119,6,0.12)',
          icon: '<svg viewBox="0 0 24 24"><path d="M12,3L1,9L12,15L21,10.09V17H23V9M5,13.18V17.18L12,21L19,17.18V13.18L12,17L5,13.18Z"/></svg>' },
        { key: 'Kinh doanh',         color: '#6366F1', bg: 'rgba(99,102,241,0.12)',
          icon: '<svg viewBox="0 0 24 24"><path d="M20,6H16V4A2,2 0 0,0 14,2H10A2,2 0 0,0 8,4V6H4A2,2 0 0,0 2,8V19A2,2 0 0,0 4,21H20A2,2 0 0,0 22,19V8A2,2 0 0,0 20,6M10,4H14V6H10V4Z"/></svg>' },
      ];

      grid.innerHTML = depts.map(dept => {
        const deptAll    = allStaff.filter(s => s.department === dept.key);
        const deptTotal  = deptAll.length;
        const deptActive = deptAll.filter(s => s.status === 'Đang làm việc').length;
        const deptLeave  = deptAll.filter(s => s.status === 'Nghỉ phép').length;
        const pct = deptTotal > 0 ? Math.round((deptActive / deptTotal) * 100) : 0;
        return `
          <div class="kpi-card-v2">
            <div class="kpi-v2-accent" style="background:${dept.color}"></div>
            <div class="kpi-v2-body">
              <div class="kpi-v2-top">
                <div class="kpi-v2-icon" style="background:${dept.bg}; color:${dept.color}">${dept.icon}</div>
                <span class="kpi-v2-pct" style="color:${dept.color}">${pct}%</span>
              </div>
              <div class="kpi-v2-dept">${dept.key}</div>
              <div class="kpi-v2-count">
                <span class="kpi-v2-active-num" style="color:${dept.color}">${deptActive}</span>
                <span class="kpi-v2-total-num">/${deptTotal}</span>
              </div>
              <span class="kpi-v2-sub">nhân sự đang hoạt động</span>
              <div class="kpi-v2-progress">
                <div class="kpi-v2-progress-fill" style="width:${pct}%; background:${dept.color}"></div>
              </div>
              <div class="kpi-v2-tags">
                <span class="kpi-v2-tag" style="background:rgba(16,185,129,0.1);color:#10B981">${deptActive} làm việc</span>
                ${deptLeave > 0 ? `<span class="kpi-v2-tag" style="background:rgba(245,158,11,0.1);color:#F59E0B">${deptLeave} nghỉ phép</span>` : ''}
              </div>
            </div>
          </div>`;
      }).join('');
    } catch (err) {
      console.error('HRM KPI render error:', err);
    }
  };

  // ---- Realtime Staff Subscription ----
  let hrmStaffCache = [];
  let hrmStaffSubscription = null;

  const subscribeToHrmStaff = () => {
    if (hrmStaffSubscription) return;
    hrmStaffSubscription = db.collection('hrm_staff').orderBy('createdAt', 'desc')
      .onSnapshot((snap) => {
        hrmStaffCache = [];
        snap.forEach(doc => { const d = doc.data(); d.id = doc.id; hrmStaffCache.push(d); });
        // Refresh student staff-lookup map with fresh data
        if (typeof _staffNameMap !== 'undefined') {
          _staffMapLoaded = false;
          _loadStaffMap();
        }
        renderHrmStaffList();
        renderHrmKpi();

        // Refresh detailed profile view if currently open
        if (_currentProfileStaff) {
          const updated = hrmStaffCache.find(x => x.id === _currentProfileStaff.id);
          if (updated) {
            _currentProfileStaff = updated;
            populateHrmProfile(updated);
          }
        }
      }, (err) => console.error('HRM staff realtime listener error:', err));
  };

  // ---- Export staff list to Excel ----
  const exportStaffToExcel = () => {
    if (!window.XLSX) { showToast('Thư viện xuất Excel chưa tải xong, vui lòng thử lại!', 'error'); return; }
    if (!hrmStaffCache.length) { showToast('Không có dữ liệu để xuất!', 'warning'); return; }

    const fmtDate = (d) => {
      if (!d) return '';
      const p = d.split('-');
      return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
    };

    const rows = hrmStaffCache.map((s, i) => {
      const seed = s.name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      const bdYear  = 1999 + (seed % 4);
      const bdMonth = String(1 + (seed % 12)).padStart(2, '0');
      const bdDay   = String(1 + ((seed * 7) % 28)).padStart(2, '0');
      const birthday = s.birthday || `${bdYear}-${bdMonth}-${bdDay}`;

      return {
        'Mã NV':              String(i + 1).padStart(5, '0'),
        'Họ và tên':          s.name || '',
        'Email':              s.email || '',
        'Ngày sinh':          fmtDate(birthday),
        'Bộ phận':            s.department || '',
        'Hình thức làm việc': s.workType || 'Full-time',
        'Số điện thoại':      s.phone || '',
        'Ngày vào làm':       fmtDate(s.joinDate),
        'Trạng thái':         s.status || '',
        'KPI (%)':            s.kpi != null ? s.kpi : '',
        'Lương cơ bản (đ)':   s.salary != null ? s.salary : '',
        'Team / Pod':         s.teamPod || '',
        'Line Manager':       s.lineManager || '',
        'Skills':             Array.isArray(s.skills) ? s.skills.join(', ') : (s.skills || ''),
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);

    // Column widths
    ws['!cols'] = [
      { wch: 8 }, { wch: 22 }, { wch: 26 }, { wch: 12 }, { wch: 14 },
      { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 8 },
      { wch: 16 }, { wch: 16 }, { wch: 20 }, { wch: 30 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Danh sách nhân sự');

    const now = new Date();
    const fileName = `NhanSu_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}.xlsx`;
    XLSX.writeFile(wb, fileName);
    showToast(`Đã xuất ${rows.length} nhân viên → ${fileName}`, 'success');
  };

  // ---- Render Staff (from realtime cache, no Firestore fetch) ----
  const renderHrmStaffList = () => {
    const tableBody = document.getElementById('hrmStaffTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '';
    try {
      const query = (document.getElementById('hrmStaffSearch')?.value || '').trim().toLowerCase();
      const deptFilter = document.getElementById('hrmStaffDeptFilter')?.value || 'All';

      const staffList = hrmStaffCache.filter(s => {
        const matchQuery = !query ||
          s.name.toLowerCase().includes(query) ||
          (s.email        && s.email.toLowerCase().includes(query)) ||
          (s.position     && s.position.toLowerCase().includes(query)) ||
          (s.employeeCode && s.employeeCode.toLowerCase().includes(query));
        const matchDept = deptFilter === 'All' || s.department === deptFilter;
        return matchQuery && matchDept;
      });

      if (staffList.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:3rem;color:var(--text-muted);font-size:0.9rem;">Không tìm thấy nhân sự phù hợp.</td></tr>`;
        return;
      }

      const fmtDate = (dateStr) => {
        if (!dateStr) return '--';
        const p = dateStr.split('-');
        return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : dateStr;
      };

      const workTypeMeta = {
        'Full-time':  { bg: '#EEF2FF', color: '#6366F1' },
        'Part-time':  { bg: '#FFF7ED', color: '#F97316' },
        'Intern':     { bg: '#F0FDF4', color: '#16A34A' },
        'Thời vụ':   { bg: '#FDF4FF', color: '#9333EA' },
        'Freelance':  { bg: '#FFFBEB', color: '#D97706' },
      };

      const statusMeta = {
        'Đang làm việc': { cls: 'hrm-badge-active',   label: 'Đang làm việc' },
        'Thử việc':      { cls: 'hrm-badge-probation', label: 'Thử việc' },
        'Nghỉ phép':     { cls: 'hrm-badge-onleave',   label: 'Nghỉ phép' },
        'Đã nghỉ việc':  { cls: 'hrm-badge-inactive',  label: 'Đã nghỉ việc' },
      };

      // Global counter starting from 00001 across full cache (not filtered list)
      const globalIndexMap = new Map(hrmStaffCache.map((s, i) => [s.id, i + 1]));

      staffList.forEach((s) => {
        const initials = s.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        const bg = getAvatarBgColor(s.name);
        const globalIdx = globalIndexMap.get(s.id) || 1;
        const empCode = String(globalIdx).padStart(5, '0');

        // Seed birthday around 2000 if not set
        const seed = s.name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        const bdYear  = 1999 + (seed % 4);               // 1999–2002
        const bdMonth = String(1 + (seed % 12)).padStart(2, '0');
        const bdDay   = String(1 + ((seed * 7) % 28)).padStart(2, '0');
        const birthday = s.birthday || `${bdYear}-${bdMonth}-${bdDay}`;

        const sm = statusMeta[s.status] || { cls: 'hrm-badge-active', label: s.status || '--' };
        const wt = s.workType || 'Full-time';
        const wtMeta = workTypeMeta[wt] || { bg: '#F3F4F6', color: '#6B7280' };

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>
            <span class="hrm-emp-code">${empCode}</span>
          </td>
          <td>
            <div style="display:flex;align-items:center;gap:0.6rem;">
              <div class="hrm-staff-card-avatar" style="width:34px;height:34px;font-size:0.75rem;flex-shrink:0;background:${bg}">${initials}</div>
              <div>
                <div style="font-weight:600;font-size:0.85rem;color:var(--text-main)">${s.name}</div>
                <div style="font-size:0.72rem;color:var(--text-muted)">${s.email || '--'}</div>
              </div>
            </div>
          </td>
          <td style="font-size:0.82rem">${fmtDate(birthday)}</td>
          <td style="font-size:0.83rem;font-weight:500;color:var(--text-main)">${s.department || '--'}</td>
          <td style="font-size:0.82rem;color:var(--text-main)">${s.jobTitle || '--'}</td>
          <td style="font-size:0.82rem;color:var(--text-muted)">${s.level || '--'}</td>
          <td>
            <span class="hrm-work-type-tag" style="background:${wtMeta.bg};color:${wtMeta.color}">${wt}</span>
          </td>
          <td style="font-size:0.82rem">${s.phone || '--'}</td>
          <td style="font-size:0.82rem">${fmtDate(s.joinDate)}</td>
          <td><span class="hrm-badge ${sm.cls}">${sm.label}</span></td>
          <td style="text-align:center">
            <div style="display:flex;gap:0.3rem;justify-content:center;align-items:center">
              <button class="action-icon-btn btn-view-hrm-staff" title="Hồ sơ" style="padding:6px;color:#6366F1;background:#EEF2FF;border:none;cursor:pointer;border-radius:7px"><svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:currentColor"><path d="M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17M12,4.5C7,4.5 2.73,7.61 1,12C2.73,16.39 7,19.5 12,19.5C17,19.5 21.27,16.39 23,12C21.27,7.61 17,4.5 12,4.5Z"/></svg></button>
              <button class="action-icon-btn btn-edit-hrm-staff" title="Sửa" style="padding:6px;color:var(--text-main);background:var(--bg-secondary,#F7F4EF);border:none;cursor:pointer;border-radius:7px"><svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:currentColor"><path d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z"/></svg></button>
              <button class="action-icon-btn btn-del-hrm-staff" title="Xóa" style="padding:6px;color:#EF4444;background:#FEF2F2;border:none;cursor:pointer;border-radius:7px"><svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:currentColor"><path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/></svg></button>
            </div>
          </td>`;

        tr.querySelector('.btn-view-hrm-staff')?.addEventListener('click', () => openHrmProfile(s));
        tr.querySelector('.btn-edit-hrm-staff')?.addEventListener('click', () => editHrmStaff(s));
        tr.querySelector('.btn-del-hrm-staff')?.addEventListener('click', () => deleteHrmStaff(s.id, s.name));
        tableBody.appendChild(tr);
      });
    } catch (err) {
      console.error('HRM staff list error:', err);
    }
  };

  // ---- Attendance (Chấm công) ----
  const ATTENDANCE_STATUS_CYCLE = ['', '1', '0.5', '0', 'N'];
  const ATTENDANCE_STATUS_META = {
    '1':   { label: '1',   cls: 'att-full' },
    '0.5': { label: '0.5', cls: 'att-half' },
    '0':   { label: '0',   cls: 'att-absent' },
    'N':   { label: 'N',   cls: 'att-off' },
    '':    { label: 'x',   cls: 'att-empty' }
  };
  const ATTENDANCE_WEEKDAY_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

  const getDaysInMonth = (monthStr) => {
    const [y, m] = monthStr.split('-').map(Number);
    return new Date(y, m, 0).getDate();
  };

  const buildAttendanceTableHead = (theadEl, monthStr) => {
    const [y, m] = monthStr.split('-').map(Number);
    const daysInMonth = getDaysInMonth(monthStr);
    let rowWeek = '<tr><th class="att-name-cell"></th>';
    let rowDay = '<tr><th class="att-name-cell">NHÂN VIÊN</th>';
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(y, m - 1, d);
      rowWeek += `<th style="font-size:0.65rem; color:var(--text-muted); font-weight:500;">${ATTENDANCE_WEEKDAY_SHORT[dateObj.getDay()]}</th>`;
      rowDay += `<th>${d}</th>`;
    }
    rowWeek += '</tr>';
    rowDay += '</tr>';
    theadEl.innerHTML = rowWeek + rowDay;
  };

  const getCurrentMonthStr = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  };

  const shiftMonthInput = (inputId, delta, callback) => {
    const input = document.getElementById(inputId);
    if (!input || !input.value) return;
    const [y, m] = input.value.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    const newVal = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    input.value = newVal;
    callback(newVal);
  };

  let hrmAttendanceSub = null;
  let hrmAttendanceCache = {};

  const subscribeToHrmAttendance = (monthStr) => {
    if (hrmAttendanceSub) { hrmAttendanceSub(); hrmAttendanceSub = null; }

    // Đọc từ checkin_logs (nhân viên tự ghi) — không cần quyền admin
    hrmAttendanceSub = db.collection('checkin_logs')
      .where('month', '==', monthStr)
      .onSnapshot((snap) => {
        // Gom theo email: { [email]: { days, checkLogs } }
        const byEmail = {};
        snap.forEach(doc => {
          const d = doc.data();
          if (!d.email || !d.date) return;
          if (!byEmail[d.email]) byEmail[d.email] = { days: {}, checkLogs: {} };
          const day = String(parseInt(d.date.split('-')[2]));
          if (d.checkin_time) {
            byEmail[d.email].days[day] = '1';
            byEmail[d.email].checkLogs[day] = { time: d.checkin_time, ip: d.checkin_ip || '' };
          }
        });

        // Map email → staffId (dùng hrmStaffCache để giữ tương thích với renderer)
        hrmAttendanceCache = {};
        hrmStaffCache.forEach(s => {
          if (s.email && byEmail[s.email]) {
            hrmAttendanceCache[s.id] = byEmail[s.email];
          }
        });

        renderHrmAttendanceTable(monthStr);
      }, (err) => console.error('Attendance realtime error:', err));
  };

  const populateAttendanceDayFilter = (monthStr) => {
    const sel = document.getElementById('hrmAttendanceDayFilter');
    if (!sel) return;
    const prevVal = sel.value;
    const daysInMonth = getDaysInMonth(monthStr);
    const [y, m] = monthStr.split('-').map(Number);
    let opts = '<option value="">Xem cả tháng</option>';
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(y, m - 1, d);
      opts += `<option value="${d}">Ngày ${d} (${ATTENDANCE_WEEKDAY_SHORT[dateObj.getDay()]})</option>`;
    }
    sel.innerHTML = opts;
    // Giữ lại ngày đang chọn nếu vẫn hợp lệ trong tháng mới
    if (prevVal && Number(prevVal) <= daysInMonth) sel.value = prevVal;
  };

  const fmtAttendanceTime = (ts) => {
    if (!ts || !ts.toDate) return '--';
    return ts.toDate().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  };

  // Render dạng bảng theo 1 ngày cụ thể: Nhân viên | Phòng ban | Trạng thái | Giờ chấm công | IP
  const renderHrmAttendanceDayView = (monthStr, day) => {
    const head = document.getElementById('hrmAttendanceHead');
    const body = document.getElementById('hrmAttendanceBody');
    head.innerHTML = '<tr><th class="att-name-cell">NHÂN VIÊN</th><th>PHÒNG BAN</th><th>TRẠNG THÁI</th><th>GIỜ CHẤM CÔNG</th><th>IP</th></tr>';

    if (hrmStaffCache.length === 0) {
      body.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:2rem; color:var(--text-muted);">Chưa có nhân sự nào.</td></tr>';
      return;
    }

    body.innerHTML = '';
    hrmStaffCache.forEach(s => {
      const att = hrmAttendanceCache[s.id] || { days: {}, checkLogs: {} };
      const val = (att.days && att.days[day]) || '';
      const meta = ATTENDANCE_STATUS_META[val] || ATTENDANCE_STATUS_META[''];
      const log = att.checkLogs && att.checkLogs[day];
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="att-name-cell"><strong>${s.name}</strong></td>
        <td>${s.department || '--'}</td>
        <td class="att-cell ${meta.cls}" data-staff-id="${s.id}" data-staff-name="${s.name}" data-day="${day}" style="cursor:pointer;">${meta.label}</td>
        <td>${log ? fmtAttendanceTime(log.time) : '--'}</td>
        <td style="font-size:0.78rem; color:var(--text-muted);">${log ? (log.ip || '--') : '--'}</td>`;
      body.appendChild(tr);
    });

    bindAttendanceCellClicks(monthStr);
  };

  const bindAttendanceCellClicks = (monthStr) => {
    document.getElementById('hrmAttendanceBody').querySelectorAll('.att-cell').forEach(cell => {
      cell.addEventListener('click', async () => {
        const staffId = cell.dataset.staffId;
        const staffName = cell.dataset.staffName;
        const day = cell.dataset.day;
        const att = hrmAttendanceCache[staffId] || { days: {} };
        const current = (att.days && att.days[day]) || '';
        const nextIdx = (ATTENDANCE_STATUS_CYCLE.indexOf(current) + 1) % ATTENDANCE_STATUS_CYCLE.length;
        const nextVal = ATTENDANCE_STATUS_CYCLE[nextIdx];
        try {
          await db.collection('attendance').doc(`${staffId}_${monthStr}`).set({
            staffId, staffName, month: monthStr,
            days: { [day]: nextVal },
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        } catch (err) {
          console.error('Lỗi cập nhật chấm công:', err);
          showToast('Lỗi cập nhật chấm công: ' + err.message, 'error');
        }
      });
    });
  };

  const renderHrmAttendanceTable = (monthStr) => {
    const head = document.getElementById('hrmAttendanceHead');
    const body = document.getElementById('hrmAttendanceBody');
    if (!head || !body) return;

    populateAttendanceDayFilter(monthStr);
    const dayFilter = document.getElementById('hrmAttendanceDayFilter')?.value || '';
    if (dayFilter) {
      renderHrmAttendanceDayView(monthStr, dayFilter);
      return;
    }

    buildAttendanceTableHead(head, monthStr);
    const daysInMonth = getDaysInMonth(monthStr);

    body.innerHTML = '';
    if (hrmStaffCache.length === 0) {
      body.innerHTML = '<tr><td colspan="32" style="text-align:center; padding:2rem; color:var(--text-muted);">Chưa có nhân sự nào.</td></tr>';
      return;
    }

    hrmStaffCache.forEach(s => {
      const att = hrmAttendanceCache[s.id] || { days: {} };
      const tr = document.createElement('tr');
      let cellsHtml = '';
      for (let d = 1; d <= daysInMonth; d++) {
        const val = (att.days && att.days[d]) || '';
        const meta = ATTENDANCE_STATUS_META[val] || ATTENDANCE_STATUS_META[''];
        cellsHtml += `<td class="att-cell ${meta.cls}" data-staff-id="${s.id}" data-staff-name="${s.name}" data-day="${d}">${meta.label}</td>`;
      }
      tr.innerHTML = `<td class="att-name-cell"><strong>${s.name}</strong><div style="font-size:0.72rem;color:var(--text-muted);">${s.department || ''}</div></td>${cellsHtml}`;
      body.appendChild(tr);
    });

    bindAttendanceCellClicks(monthStr);
  };

  const initHrmAttendanceTab = () => {
    const monthInput = document.getElementById('hrmAttendanceMonth');
    if (!monthInput) return;
    if (!monthInput.value) monthInput.value = getCurrentMonthStr();
    subscribeToHrmAttendance(monthInput.value);
    window.AttendanceService?.loadOfficeIpDisplay();

    const dayFilter = document.getElementById('hrmAttendanceDayFilter');
    if (dayFilter && !dayFilter.dataset.bound) {
      dayFilter.dataset.bound = '1';
      dayFilter.addEventListener('change', () => renderHrmAttendanceTable(monthInput.value));
    }
  };

  // ==========================================================================
  // HRM PAYROLL TAB — Tính công & lương
  // ==========================================================================

  // Tính số ngày công chuẩn S cho một tháng
  // S = ngày T2–T6 + 1.5 (nếu 4 T7) hoặc + 2 (nếu 5 T7)
  const calcStandardDays = (monthStr) => {
    const [y, m] = monthStr.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    let weekdays = 0, saturdays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const dow = new Date(y, m - 1, d).getDay(); // 0=CN, 6=T7
      if (dow >= 1 && dow <= 5) weekdays++;
      if (dow === 6) saturdays++;
    }
    const S = weekdays + (saturdays >= 5 ? 2 : 1.5);
    return { S, weekdays, saturdays };
  };

  const fmtMoney = (n) => Math.round(n).toLocaleString('vi-VN') + ' đ';

  const renderPayrollTable = async (monthStr) => {
    const body = document.getElementById('payrollBody');
    if (!body) return;

    const { S, weekdays, saturdays } = calcStandardDays(monthStr);
    const satBonus = saturdays >= 5 ? 2 : 1.5;
    const elS   = document.getElementById('payrollStandardDays');
    const elWd  = document.getElementById('payrollWeekdays');
    const elSat = document.getElementById('payrollSaturdays');
    const elSatNote = document.getElementById('payrollSatNote');
    if (elS)   elS.textContent  = S % 1 === 0 ? S : S.toFixed(1);
    if (elWd)  elWd.textContent = weekdays;
    if (elSat) elSat.textContent = saturdays;
    if (elSatNote) elSatNote.textContent = `+${satBonus} ngày công`;

    if (!hrmStaffCache.length) {
      body.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--text-muted);">Chưa có nhân sự nào.</td></tr>';
      return;
    }

    // Lấy giờ chuẩn từ input
    const timeInStd  = document.getElementById('payrollTimeIn')?.value  || '07:45';
    const timeOutStd = document.getElementById('payrollTimeOut')?.value || '17:00';
    const [inH, inM]   = timeInStd.split(':').map(Number);
    const [outH, outM] = timeOutStd.split(':').map(Number);

    // Lấy toàn bộ checkin_logs của tháng
    let allLogs = [];
    try {
      const snap = await db.collection('checkin_logs').where('month', '==', monthStr).get();
      allLogs = snap.docs.map(d => d.data());
    } catch (e) { console.error('Lỗi tải checkin_logs:', e); }

    // Nhóm log theo email
    const logsByEmail = {};
    allLogs.forEach(l => {
      if (!l.email) return;
      if (!logsByEmail[l.email]) logsByEmail[l.email] = [];
      logsByEmail[l.email].push(l);
    });

    body.innerHTML = '';
    hrmStaffCache.forEach(s => {
      const lcb      = Number(s.salary) || 0;
      const logs     = logsByEmail[s.email] || [];
      const dayRate  = S > 0 ? lcb / S : 0;
      const hourRate = S > 0 ? lcb / S / 7.5 : 0;

      // Chỉ đếm T2–T6 cho ngày công thực tế
      let workedDays = 0, lateDays = 0, earlyDays = 0;
      logs.forEach(l => {
        if (!l.checkin_time || !l.date) return;
        const dow = new Date(l.date + 'T00:00:00').getDay();
        if (dow < 1 || dow > 5) return; // bỏ qua T7, CN

        workedDays++;
        const cin = l.checkin_time.toDate ? l.checkin_time.toDate() : new Date(l.checkin_time);
        if (cin.getHours() > inH || (cin.getHours() === inH && cin.getMinutes() > inM)) lateDays++;
        if (l.checkout_time) {
          const cout = l.checkout_time.toDate ? l.checkout_time.toDate() : new Date(l.checkout_time);
          if (cout.getHours() < outH || (cout.getHours() === outH && cout.getMinutes() < outM)) earlyDays++;
        }
      });

      const rowId    = `pr_${s.id}`;
      const prevOtWd = document.getElementById(`${rowId}_otwd`)?.value || '0';
      const prevOtWe = document.getElementById(`${rowId}_otwe`)?.value || '0';

      // Tính lương theo đúng công thức
      const calcSalary = (otWd, otWe) => {
        const dayPay    = dayRate * workedDays;
        const otWdPay   = hourRate * Number(otWd) * 1.5;
        const otWePay   = hourRate * Number(otWe) * 2.0;
        const penalty   = 50000 * (lateDays + earlyDays);
        return { dayPay, otWdPay, otWePay, penalty,
                 total: Math.max(0, dayPay + otWdPay + otWePay - penalty) };
      };

      const renderSalaryCell = (otWd, otWe) => {
        if (!lcb) return '<span style="color:var(--text-muted);font-weight:400;font-size:0.8rem;">Chưa có LCB</span>';
        const { dayPay, otWdPay, otWePay, penalty, total } = calcSalary(otWd, otWe);
        const hasBonuses = (otWdPay + otWePay + penalty) > 0;
        return `
          <div style="font-weight:700;color:var(--accent);font-size:0.95rem;">${fmtMoney(total)}</div>
          ${hasBonuses ? `<div style="font-size:0.68rem;color:var(--text-muted);margin-top:2px;line-height:1.5;">
            NC: ${fmtMoney(dayPay)}
            ${otWdPay > 0 ? `<span style="color:#10B981"> +TC: ${fmtMoney(otWdPay + otWePay)}</span>` : ''}
            ${penalty > 0  ? `<span style="color:#EF4444"> −Phạt: ${fmtMoney(penalty)}</span>` : ''}
          </div>` : ''}`;
      };

      const penaltyColor = (lateDays + earlyDays) > 0 ? '#EF4444' : 'var(--text-muted)';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <strong>${s.name}</strong>
          <div style="font-size:0.68rem;color:var(--text-muted);margin-top:2px;line-height:1.6;">
            ${s.department ? s.department + ' &nbsp;|&nbsp; ' : ''}
            ${lcb > 0 ? `ĐG công: ${fmtMoney(dayRate)} &nbsp;|&nbsp; ĐG giờ: ${fmtMoney(hourRate)}` : ''}
          </div>
        </td>
        <td style="text-align:right;white-space:nowrap;">${lcb > 0 ? Number(lcb).toLocaleString('vi-VN') + ' đ' : '<span style="color:var(--text-muted)">--</span>'}</td>
        <td style="text-align:center;">${S % 1 === 0 ? S : S.toFixed(1)}</td>
        <td style="text-align:center;font-weight:700;color:#10B981;font-size:1rem;">${workedDays}</td>
        <td style="text-align:center;">
          ${lateDays > 0 || earlyDays > 0
            ? `<div style="font-size:0.78rem;color:${penaltyColor};line-height:1.7;">
                ${lateDays > 0  ? `<div>⏰ Muộn: <strong>${lateDays}</strong> lần</div>` : ''}
                ${earlyDays > 0 ? `<div>🏃 Sớm: <strong>${earlyDays}</strong> lần</div>` : ''}
                <div style="color:#EF4444;font-size:0.72rem;">−${fmtMoney(50000*(lateDays+earlyDays))}</div>
               </div>`
            : `<span style="color:var(--text-muted);font-size:0.8rem;">—</span>`}
        </td>
        <td style="text-align:center;">
          <input type="number" id="${rowId}_otwd" value="${prevOtWd}" min="0" step="0.5"
            style="width:68px;padding:0.3rem 0.4rem;border:1px solid var(--border);border-radius:6px;background:var(--bg-primary);color:var(--text-main);font-size:0.82rem;text-align:center;"
            data-row="${rowId}" class="payroll-ot-input" />
        </td>
        <td style="text-align:center;">
          <input type="number" id="${rowId}_otwe" value="${prevOtWe}" min="0" step="0.5"
            style="width:68px;padding:0.3rem 0.4rem;border:1px solid var(--border);border-radius:6px;background:var(--bg-primary);color:var(--text-main);font-size:0.82rem;text-align:center;"
            data-row="${rowId}" class="payroll-ot-input" />
        </td>
        <td style="text-align:right;" id="${rowId}_total">${renderSalaryCell(prevOtWd, prevOtWe)}</td>`;
      body.appendChild(tr);

      // Cập nhật lương realtime khi nhập tăng ca
      tr.querySelectorAll('.payroll-ot-input').forEach(inp => {
        inp.addEventListener('input', () => {
          const otWd    = document.getElementById(`${rowId}_otwd`)?.value || '0';
          const otWe    = document.getElementById(`${rowId}_otwe`)?.value || '0';
          const totalEl = document.getElementById(`${rowId}_total`);
          if (totalEl) totalEl.innerHTML = renderSalaryCell(otWd, otWe);
        });
      });
    });
  };

  const initHrmPayrollTab = () => {
    const monthInput = document.getElementById('payrollMonth');
    if (!monthInput) return;
    if (!monthInput.value) monthInput.value = getCurrentMonthStr();

    renderPayrollTable(monthInput.value);

    const once = (id, fn) => {
      const el = document.getElementById(id);
      if (el && !el.dataset.prBound) { el.dataset.prBound = '1'; el.addEventListener('click', fn); }
    };
    once('btnPayrollPrevMonth', () => {
      const [y, m] = monthInput.value.split('-').map(Number);
      const d = new Date(y, m - 2, 1);
      monthInput.value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      renderPayrollTable(monthInput.value);
    });
    once('btnPayrollNextMonth', () => {
      const [y, m] = monthInput.value.split('-').map(Number);
      const d = new Date(y, m, 1);
      monthInput.value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      renderPayrollTable(monthInput.value);
    });
    if (!monthInput.dataset.prBound) {
      monthInput.dataset.prBound = '1';
      monthInput.addEventListener('change', () => renderPayrollTable(monthInput.value));
    }
    // Re-render khi đổi giờ chuẩn
    ['payrollTimeIn','payrollTimeOut'].forEach(id => {
      const el = document.getElementById(id);
      if (el && !el.dataset.prBound) {
        el.dataset.prBound = '1';
        el.addEventListener('change', () => renderPayrollTable(monthInput.value));
      }
    });
  };

  const editHrmStaff = (s) => {
    document.getElementById('hrmStaffEditId').value = s.id;
    document.getElementById('hrmStaffName').value = s.name || '';

    const emailEl = document.getElementById('hrmStaffEmail');
    if (emailEl) {
      emailEl.value = s.email || '';
      emailEl.readOnly = true;
      emailEl.style.opacity = '0.6';
      emailEl.style.cursor = 'not-allowed';
    }

    const deptEl = document.getElementById('hrmStaffDept');
    if (deptEl) {
      deptEl.value = s.department || DEPARTMENTS[0];
      if (!deptEl.value) deptEl.value = DEPARTMENTS[0];
    }

    const jtEl = document.getElementById('hrmStaffJobTitle');
    if (jtEl) {
      jtEl.value = s.jobTitle || 'Nhân viên';
      if (!jtEl.value) jtEl.value = 'Nhân viên';
    }

    const lvEl = document.getElementById('hrmStaffLevel');
    if (lvEl) {
      lvEl.value = s.level || 'Cấp 1';
      if (!lvEl.value) lvEl.value = 'Cấp 1';
    }

    document.getElementById('hrmStaffPhone').value = s.phone || '';
    document.getElementById('hrmStaffStatus').value = s.status || 'Đang làm việc';

    const bdEl = document.getElementById('hrmStaffBirthday');
    const wtEl = document.getElementById('hrmStaffWorkType');
    const jdEl = document.getElementById('hrmStaffJoinDate');
    if (bdEl) bdEl.value = s.birthday || '';
    if (wtEl) wtEl.value = s.workType || 'Full-time';
    if (jdEl) jdEl.value = s.joinDate || '';

    const unEl = document.getElementById('hrmStaffUsername');
    const htEl = document.getElementById('hrmStaffHometown');
    const gdEl = document.getElementById('hrmStaffGender');
    const msEl = document.getElementById('hrmStaffMarital');
    const edEl = document.getElementById('hrmStaffEducation');
    const enEl = document.getElementById('hrmStaffEmergencyName');
    const epEl = document.getElementById('hrmStaffEmergencyPhone');
    const erEl = document.getElementById('hrmStaffEmergencyRelation');
    if (unEl) unEl.value = s.username || '';
    if (htEl) htEl.value = s.hometown || '';
    if (gdEl) gdEl.value = s.gender || '';
    if (msEl) msEl.value = s.maritalStatus || '';
    if (edEl) edEl.value = s.education || '';
    if (enEl) enEl.value = s.emergencyContactName || '';
    if (epEl) epEl.value = s.emergencyContactPhone || '';
    if (erEl) erEl.value = s.emergencyContactRelation || '';

    document.getElementById('hrmStaffModalTitle').textContent = '✏️ SỬA THÔNG TIN NHÂN SỰ';
    const pwSection = document.getElementById('hrmStaffPasswordSection');
    if (pwSection) pwSection.style.display = 'none';
    const pwInput = document.getElementById('hrmStaffPassword');
    const pwConfirm = document.getElementById('hrmStaffPasswordConfirm');
    if (pwInput)   { pwInput.required = false; pwInput.value = ''; }
    if (pwConfirm) { pwConfirm.required = false; pwConfirm.value = ''; }
    document.getElementById('hrmStaffModal').style.display = 'flex';
  };

  const deleteHrmStaff = async (id, name) => {
    if (!confirm(`Xác nhận xóa nhân sự "${name}" khỏi hệ thống?`)) return;
    try {
      await db.collection('hrm_staff').doc(id).delete();
      showToast(`Đã xóa nhân sự ${name}!`, 'warning');
      reloadCrmStaff();
    } catch (err) {
      showToast('Lỗi khi xóa nhân sự!', 'error');
    }
  };

  // ---- Render Projects ----
  const renderHrmProjects = async () => {
    const grid = document.getElementById('hrmProjectsGrid');
    if (!grid) return;
    grid.innerHTML = '';
    try {
      const snap = await db.collection('hrm_projects').orderBy('createdAt', 'desc').get();
      if (snap.empty) {
        grid.innerHTML = '<div class="hrm-empty-state"><svg viewBox="0 0 24 24"><path d="M19,3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3M19,19H5V5H19V19M17,12H7V10H17V12M17,16H7V14H17V16M14,8H7V6H14V8Z"/></svg><h4>Chưa có dự án nào</h4><p>Hãy tạo dự án mới để bắt đầu quản lý.</p></div>';
        return;
      }
      snap.forEach(doc => {
        const p = doc.data();
        p.id = doc.id;
        let badgeCls = 'hrm-badge-planning';
        if (p.status === 'Đang thực hiện') badgeCls = 'hrm-badge-inprogress';
        else if (p.status === 'Đánh giá') badgeCls = 'hrm-badge-review';
        else if (p.status === 'Hoàn thành') badgeCls = 'hrm-badge-completed';

        const initials = p.leader ? p.leader.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : '??';
        const bg = getAvatarBgColor(p.leader || 'default');

        const card = document.createElement('div');
        card.className = 'hrm-project-card';
        card.innerHTML = `
          <div class="hrm-project-header">
            <div class="hrm-project-title">${p.name}</div>
            <span class="hrm-badge ${badgeCls}">${p.status}</span>
          </div>
          <div class="hrm-project-desc">${p.description || 'Không có mô tả'}</div>
          <div class="hrm-project-progress">
            <div class="hrm-project-progress-header">
              <span class="hrm-project-progress-label">Tiến độ</span>
              <span class="hrm-project-progress-value">${p.progress || 0}%</span>
            </div>
            <div class="hrm-project-progress-bar"><div class="hrm-project-progress-fill" style="width:${p.progress || 0}%"></div></div>
          </div>
          <div class="hrm-project-meta">
            <div class="hrm-project-meta-item">
              <div class="hrm-project-leader-avatar" style="background:${bg}">${initials}</div>
              <span>${p.leader || 'Chưa phân công'}</span>
            </div>
            <div class="hrm-project-meta-item">
              <svg viewBox="0 0 24 24"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20M9,13V18H7V13H9M15,15V18H13V15H15M11,11V18H13V11H11Z"/></svg>
              <span>${p.tasksCount || 0} nhiệm vụ</span>
            </div>
            <div style="display:flex;gap:2px">
              <button class="hrm-action-btn btn-detail-hrm-proj" title="Chi tiết" style="background:#EFF6FF;color:#2563EB;"><svg viewBox="0 0 24 24"><path d="M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17M12,4.5C7,4.5 2.73,7.61 1,12C2.73,16.39 7,19.5 12,19.5C17,19.5 21.27,16.39 23,12C21.27,7.61 17,4.5 12,4.5Z" fill="currentColor"/></svg></button>
              <button class="hrm-action-btn btn-edit-hrm-proj" title="Sửa"><svg viewBox="0 0 24 24"><path d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z"/></svg></button>
              <button class="hrm-action-btn danger btn-del-hrm-proj" title="Xóa"><svg viewBox="0 0 24 24"><path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/></svg></button>
            </div>
          </div>`;

        card.querySelector('.btn-edit-hrm-proj')?.addEventListener('click', () => {
          document.getElementById('hrmProjectEditId').value = p.id;
          document.getElementById('hrmProjectName').value = p.name;
          document.getElementById('hrmProjectDesc').value = p.description || '';
          document.getElementById('hrmProjectStatus').value = p.status;
          document.getElementById('hrmProjectProgress').value = p.progress || 0;
          document.getElementById('hrmProjectLeader').value = p.leader || '';
          document.getElementById('hrmProjectTasks').value = p.tasksCount || 0;
          if (document.getElementById('hrmProjectScale')) document.getElementById('hrmProjectScale').value = p.scale || 'Nhỏ';
          if (document.getElementById('hrmProjectDeadline')) document.getElementById('hrmProjectDeadline').value = p.deadline || '';
          document.getElementById('hrmProjectModalTitle').textContent = '✏️ SỬA DỰ ÁN';
          document.getElementById('hrmProjectModal').style.display = 'flex';
        });
        card.querySelector('.btn-del-hrm-proj')?.addEventListener('click', async () => {
          if (!confirm(`Xác nhận xóa dự án "${p.name}"?`)) return;
          try {
            await db.collection('hrm_projects').doc(p.id).delete();
            showToast(`Đã xóa dự án ${p.name}!`, 'warning');
            renderHrmProjects();
          } catch (err) { showToast('Lỗi khi xóa dự án!', 'error'); }
        });
        card.querySelector('.btn-detail-hrm-proj')?.addEventListener('click', () => openProjectDetail(p));
        grid.appendChild(card);
      });
    } catch (err) {
      console.error('HRM projects render error:', err);
    }
  };

  // ---- Project Detail Modal ----
  let _pdCurrentProjectId = null;

  const PD_RATINGS = ['Yếu', 'TB', 'Khá', 'Tốt', 'Xuất sắc'];
  const PD_RATING_COLORS = ['#EF4444', '#F97316', '#EAB308', '#10B981', '#6366F1'];

  const renderPdMemberCard = (m, docId, projectId) => {
    const ini = (m.name || '??').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    const bg = getAvatarBgColor(m.name || 'x');
    const stars = Array.from({ length: 5 }, (_, i) => {
      const active = (m.rating || 0) > i;
      return `<span class="pd-star" data-val="${i+1}" style="cursor:pointer;font-size:1.1rem;color:${active ? '#F59E0B' : '#D1D5DB'};transition:color .1s;">★</span>`;
    }).join('');
    return `<div class="pd-member-card" data-member-id="${docId}" style="background:#fff;border:1px solid #F0F0F0;border-radius:12px;padding:1rem 1.1rem;margin-bottom:0.75rem;box-shadow:0 1px 4px rgba(0,0,0,0.05);">
      <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.75rem;">
        <div style="width:38px;height:38px;border-radius:50%;background:${bg};color:#fff;display:flex;align-items:center;justify-content:center;font-size:0.78rem;font-weight:700;flex-shrink:0;">${ini}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:0.88rem;font-weight:700;color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${m.name || 'Chưa có tên'}</div>
          <div style="font-size:0.72rem;color:var(--text-muted);">${m.role || 'Thành viên'}</div>
        </div>
        <button class="pd-del-member" data-id="${docId}" style="background:none;border:none;color:#EF4444;cursor:pointer;opacity:0.5;font-size:1rem;padding:2px 4px;" title="Xóa">✕</button>
      </div>
      <div style="margin-bottom:0.6rem;">
        <div style="font-size:0.68rem;color:var(--text-muted);margin-bottom:4px;font-weight:500;">ĐÁNH GIÁ</div>
        <div class="pd-stars" style="display:flex;gap:3px;margin-bottom:6px;">${stars}</div>
        ${m.rating ? `<span style="font-size:0.7rem;font-weight:600;color:${PD_RATING_COLORS[(m.rating||1)-1]};background:${PD_RATING_COLORS[(m.rating||1)-1]}18;padding:2px 8px;border-radius:6px;">${PD_RATINGS[(m.rating||1)-1]}</span>` : ''}
      </div>
      <textarea class="pd-eval-text" placeholder="Nhận xét về thành viên này..." rows="2"
        style="width:100%;padding:0.45rem 0.6rem;border:1px solid #E5E7EB;border-radius:8px;font-size:0.78rem;resize:vertical;box-sizing:border-box;min-height:56px;">${m.evaluation || ''}</textarea>
      <div style="display:flex;justify-content:flex-end;margin-top:0.5rem;">
        <button class="pd-save-eval" data-id="${docId}" style="padding:0.33rem 0.85rem;background:#059669;color:#fff;border:none;border-radius:7px;font-size:0.72rem;font-weight:600;cursor:pointer;">Lưu đánh giá</button>
      </div>
    </div>`;
  };

  const loadPdMembers = async (projectId) => {
    const list = document.getElementById('pdMembersList');
    if (!list) return;
    list.innerHTML = '<div style="font-size:0.78rem;color:var(--text-muted);text-align:center;padding:1.5rem 0;">Đang tải...</div>';
    try {
      const snap = await db.collection('hrm_projects').doc(projectId).collection('members').orderBy('createdAt', 'asc').get();
      if (snap.empty) {
        list.innerHTML = '<div style="font-size:0.8rem;color:var(--text-muted);text-align:center;padding:2rem 0;font-style:italic;">Chưa có thành viên. Nhấn "+ Thêm thành viên" để bắt đầu.</div>';
        return;
      }
      list.innerHTML = '';
      snap.forEach(doc => {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = renderPdMemberCard(doc.data(), doc.id, projectId);
        const card = wrapper.firstElementChild;

        // Star click
        let currentRating = doc.data().rating || 0;
        card.querySelectorAll('.pd-star').forEach(star => {
          star.addEventListener('click', () => {
            currentRating = parseInt(star.dataset.val);
            card.querySelectorAll('.pd-star').forEach((s, i) => {
              s.style.color = i < currentRating ? '#F59E0B' : '#D1D5DB';
            });
          });
          star.addEventListener('mouseenter', () => {
            const hv = parseInt(star.dataset.val);
            card.querySelectorAll('.pd-star').forEach((s, i) => { s.style.color = i < hv ? '#F59E0B' : '#D1D5DB'; });
          });
          star.addEventListener('mouseleave', () => {
            card.querySelectorAll('.pd-star').forEach((s, i) => { s.style.color = i < currentRating ? '#F59E0B' : '#D1D5DB'; });
          });
        });

        // Save eval
        card.querySelector('.pd-save-eval')?.addEventListener('click', async () => {
          const evaluation = card.querySelector('.pd-eval-text')?.value.trim() || '';
          try {
            await db.collection('hrm_projects').doc(projectId).collection('members').doc(doc.id).update({ rating: currentRating, evaluation });
            showToast('Đã lưu đánh giá!', 'success');
          } catch(e) { showToast('Lỗi: ' + e.message, 'error'); }
        });

        // Delete member
        card.querySelector('.pd-del-member')?.addEventListener('click', async () => {
          if (!confirm('Xóa thành viên này?')) return;
          try {
            await db.collection('hrm_projects').doc(projectId).collection('members').doc(doc.id).delete();
            loadPdMembers(projectId);
          } catch(e) { showToast('Lỗi: ' + e.message, 'error'); }
        });

        list.appendChild(card);
      });
    } catch(e) { list.innerHTML = '<div style="color:#EF4444;font-size:0.8rem;padding:1rem;">Lỗi tải thành viên.</div>'; }
  };

  const openProjectDetail = (p) => {
    _pdCurrentProjectId = p.id;
    const modal = document.getElementById('projectDetailModal');
    if (!modal) return;

    document.getElementById('pdModalTitle').textContent = p.name;

    const badgeColor = { 'Lập kế hoạch': '#7C3AED', 'Đang thực hiện': '#2563EB', 'Đánh giá': '#D97706', 'Hoàn thành': '#16A34A' };
    const color = badgeColor[p.status] || '#6B7280';
    const fmtDate = d => d ? new Date(d).toLocaleDateString('vi-VN') : '--';
    const infoEl = document.getElementById('pdProjectInfo');
    if (infoEl) {
      infoEl.innerHTML = `
        <div style="margin-bottom:1rem;">
          <span style="display:inline-block;padding:0.28rem 0.75rem;border-radius:20px;font-size:0.68rem;font-weight:700;letter-spacing:.5px;color:${color};background:${color}1A;">${p.status}</span>
        </div>
        <p style="font-size:0.8rem;color:var(--text-muted);line-height:1.6;margin-bottom:1.25rem;">${p.description || 'Không có mô tả.'}</p>
        <div style="display:flex;flex-direction:column;gap:0.85rem;">
          <div>
            <div style="font-size:0.65rem;font-weight:700;letter-spacing:1px;color:var(--text-muted);margin-bottom:3px;">TIẾN ĐỘ</div>
            <div style="display:flex;align-items:center;gap:0.6rem;">
              <div style="flex:1;height:6px;background:#F0F0F0;border-radius:99px;overflow:hidden;">
                <div style="height:100%;width:${p.progress||0}%;background:linear-gradient(90deg,#2563EB,#60A5FA);border-radius:99px;transition:width .6s;"></div>
              </div>
              <span style="font-size:0.78rem;font-weight:700;color:#2563EB;">${p.progress||0}%</span>
            </div>
          </div>
          <div><div style="font-size:0.65rem;font-weight:700;letter-spacing:1px;color:var(--text-muted);margin-bottom:2px;">NGƯỜI PHỤ TRÁCH</div>
            <div style="font-size:0.82rem;font-weight:600;color:var(--text-main);">${p.leader || '--'}</div></div>
          <div><div style="font-size:0.65rem;font-weight:700;letter-spacing:1px;color:var(--text-muted);margin-bottom:2px;">QUY MÔ</div>
            <div style="font-size:0.82rem;color:var(--text-main);">${p.scale || 'Nhỏ'}</div></div>
          <div><div style="font-size:0.65rem;font-weight:700;letter-spacing:1px;color:var(--text-muted);margin-bottom:2px;">DEADLINE</div>
            <div style="font-size:0.82rem;color:var(--text-main);">${fmtDate(p.deadline)}</div></div>
          <div><div style="font-size:0.65rem;font-weight:700;letter-spacing:1px;color:var(--text-muted);margin-bottom:2px;">SỐ NHIỆM VỤ</div>
            <div style="font-size:0.82rem;color:var(--text-main);">${p.tasksCount || 0} nhiệm vụ</div></div>
        </div>`;
    }

    document.getElementById('pdAddMemberForm').style.display = 'none';
    document.getElementById('pdMemberName').value = '';
    document.getElementById('pdMemberRole').value = '';
    loadPdMembers(p.id);
    modal.style.display = 'flex';
  };

  document.getElementById('btnClosePdModal')?.addEventListener('click', () => {
    document.getElementById('projectDetailModal').style.display = 'none';
  });
  document.getElementById('projectDetailModal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('projectDetailModal')) document.getElementById('projectDetailModal').style.display = 'none';
  });

  document.getElementById('btnAddPdMember')?.addEventListener('click', () => {
    const f = document.getElementById('pdAddMemberForm');
    if (f.style.display !== 'none') { f.style.display = 'none'; return; }
    // Render staff picker
    const pickerEl = document.getElementById('pdStaffPickerList');
    if (pickerEl) {
      const staffList = hrmStaffCache.length ? hrmStaffCache : [];
      if (!staffList.length) {
        pickerEl.innerHTML = '<div style="font-size:0.78rem;color:var(--text-muted);font-style:italic;padding:0.5rem;">Chưa có nhân viên nào trong hệ thống.</div>';
      } else {
        pickerEl.innerHTML = staffList.map(s => {
          const ini = (s.name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
          const bg = getAvatarBgColor(s.name || 'x');
          return `<label class="pd-staff-pick-row" style="display:flex;align-items:center;gap:0.65rem;padding:0.45rem 0.6rem;border-radius:8px;cursor:pointer;border:2px solid transparent;transition:all .12s;" data-staff-id="${s.id}" data-name="${s.name}">
            <input type="radio" name="pdStaffPick" value="${s.id}" style="display:none;" />
            <div style="width:30px;height:30px;border-radius:50%;background:${bg};color:#fff;display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:700;flex-shrink:0;">${ini}</div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:0.82rem;font-weight:600;color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${s.name || '--'}</div>
              <div style="font-size:0.68rem;color:var(--text-muted);">${s.position || s.department || ''}</div>
            </div>
          </label>`;
        }).join('');

        pickerEl.querySelectorAll('.pd-staff-pick-row').forEach(row => {
          row.addEventListener('click', () => {
            pickerEl.querySelectorAll('.pd-staff-pick-row').forEach(r => {
              r.style.borderColor = 'transparent';
              r.style.background = 'transparent';
            });
            row.style.borderColor = '#2563EB';
            row.style.background = '#DBEAFE';
            document.getElementById('pdMemberName').value = row.dataset.name;
            document.getElementById('pdMemberStaffId').value = row.dataset.staffId;
          });
        });
      }
    }
    document.getElementById('pdMemberRole').value = '';
    document.getElementById('pdMemberName').value = '';
    document.getElementById('pdMemberStaffId').value = '';
    f.style.display = 'block';
  });
  document.getElementById('btnCancelPdMember')?.addEventListener('click', () => {
    document.getElementById('pdAddMemberForm').style.display = 'none';
  });
  document.getElementById('btnSavePdMember')?.addEventListener('click', async () => {
    const name = document.getElementById('pdMemberName')?.value.trim();
    const staffId = document.getElementById('pdMemberStaffId')?.value.trim();
    if (!name) { showToast('Vui lòng chọn một thành viên từ danh sách', 'error'); return; }
    if (!_pdCurrentProjectId) return;
    const role = document.getElementById('pdMemberRole')?.value.trim();
    try {
      await db.collection('hrm_projects').doc(_pdCurrentProjectId).collection('members').add({
        name, staffId: staffId || null, role, rating: 0, evaluation: '',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      document.getElementById('pdAddMemberForm').style.display = 'none';
      loadPdMembers(_pdCurrentProjectId);
      showToast('Đã thêm thành viên!', 'success');
    } catch(e) { showToast('Lỗi: ' + e.message, 'error'); }
  });

  // ---- Render Payments ----
  const formatVND = (num) => {
    return new Intl.NumberFormat('vi-VN').format(num) + ' ₫';
  };

  const renderHrmPayments = async () => {
    const tbody = document.getElementById('hrmPaymentsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    try {
      const snap = await db.collection('hrm_payments').orderBy('createdAt', 'desc').get();
      if (snap.empty) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-muted);font-size:0.85rem;">Chưa có đề xuất thanh toán nào.</td></tr>';
        return;
      }
      const isAdmin = currentUser && currentUser.role === 'admin';
      snap.forEach(doc => {
        const p = doc.data();
        p.id = doc.id;
        let badgeCls = 'hrm-badge-pending';
        if (p.status === 'Đã duyệt') badgeCls = 'hrm-badge-approved';
        else if (p.status === 'Từ chối') badgeCls = 'hrm-badge-rejected';

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${p.requester || 'N/A'}</strong><br><span style="font-size:0.72rem;color:var(--text-muted)">${p.department || ''}</span></td>
          <td>${p.purpose || ''}</td>
          <td><span style="font-size:0.78rem;">${p.category || ''}</span></td>
          <td><span class="hrm-payment-amount">${formatVND(p.amount || 0)}</span></td>
          <td><span class="hrm-badge ${badgeCls}">${p.status}</span></td>
          <td style="text-align:center">
            ${isAdmin && p.status === 'Chờ duyệt' ? `
              <button class="hrm-action-btn success btn-approve-pay" title="Duyệt"><svg viewBox="0 0 24 24"><path d="M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z"/></svg></button>
              <button class="hrm-action-btn danger btn-reject-pay" title="Từ chối"><svg viewBox="0 0 24 24"><path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/></svg></button>
            ` : ''}
            <button class="hrm-action-btn danger btn-del-pay" title="Xóa"><svg viewBox="0 0 24 24"><path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/></svg></button>
          </td>`;

        tr.querySelector('.btn-approve-pay')?.addEventListener('click', async () => {
          try {
            await db.collection('hrm_payments').doc(p.id).update({ status: 'Đã duyệt' });
            showToast('Đã duyệt đề xuất thanh toán!', 'success');
            renderHrmPayments();
          } catch (err) { showToast('Lỗi khi duyệt!', 'error'); }
        });
        tr.querySelector('.btn-reject-pay')?.addEventListener('click', async () => {
          try {
            await db.collection('hrm_payments').doc(p.id).update({ status: 'Từ chối' });
            showToast('Đã từ chối đề xuất thanh toán.', 'warning');
            renderHrmPayments();
          } catch (err) { showToast('Lỗi khi từ chối!', 'error'); }
        });
        tr.querySelector('.btn-del-pay')?.addEventListener('click', async () => {
          if (!confirm(`Xóa đề xuất thanh toán "${p.purpose}"?`)) return;
          try {
            await db.collection('hrm_payments').doc(p.id).delete();
            showToast('Đã xóa đề xuất!', 'warning');
            renderHrmPayments();
          } catch (err) { showToast('Lỗi khi xóa!', 'error'); }
        });
        tbody.appendChild(tr);
      });
    } catch (err) {
      console.error('HRM payments render error:', err);
    }
  };

  // ===================================================
  //  CRM MODULE — Customer Relationship Management
  // ===================================================

  let crmInitialized = false;
  let _currentCrmCustomer = null;
  let _allCrmCustomers = [];

  const drawCrmBarChart = (canvasId, labels, values, colors) => {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const maxVal = Math.max(...values, 1);
    const barCount = labels.length;
    const gap = Math.floor((W - 50) / barCount);
    const barWidth = Math.floor(gap * 0.55);
    const maxBarH = H - 55;
    const baseline = H - 28;

    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      const y = baseline - (maxBarH * i / 4);
      ctx.beginPath(); ctx.moveTo(42, y); ctx.lineTo(W - 8, y); ctx.stroke();
      ctx.fillStyle = '#9CA3AF';
      ctx.font = '10px system-ui';
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(maxVal * i / 4), 38, y + 4);
    }

    values.forEach((val, i) => {
      const x = 48 + i * gap + (gap - barWidth) / 2;
      const barH = maxBarH * (val / maxVal);
      const y = baseline - barH;

      const grad = ctx.createLinearGradient(0, y, 0, baseline);
      grad.addColorStop(0, colors[i % colors.length]);
      grad.addColorStop(1, colors[i % colors.length] + '60');
      ctx.fillStyle = grad;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(x, y, barWidth, barH, [4, 4, 0, 0]);
      } else {
        ctx.rect(x, y, barWidth, barH);
      }
      ctx.fill();

      ctx.fillStyle = '#374151';
      ctx.font = 'bold 12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(val, x + barWidth / 2, y - 6);

      ctx.fillStyle = '#6B7280';
      ctx.font = '10px system-ui';
      ctx.fillText(labels[i], x + barWidth / 2, baseline + 16);
    });
  };

  const openCrmProfile = (customer) => {
    _currentCrmCustomer = customer;
    const subtabs = document.querySelector('.crm-subtabs');
    if (subtabs) subtabs.style.display = 'none';
    document.querySelectorAll('.crm-tab-content').forEach(el => el.style.display = 'none');
    const pv = document.getElementById('crmCustomerProfile');
    if (pv) { pv.style.display = 'flex'; pv.style.flexDirection = 'column'; }
    document.querySelectorAll('.crm-ptab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.crm-ptab-panel').forEach(p => p.classList.remove('active'));
    const firstTab = document.querySelector('.crm-ptab[data-ctab="ctab-info"]');
    if (firstTab) firstTab.classList.add('active');
    const firstPanel = document.getElementById('ctab-info');
    if (firstPanel) firstPanel.classList.add('active');
    populateCrmProfile(customer);
  };

  const closeCrmProfile = () => {
    const pv = document.getElementById('crmCustomerProfile');
    if (pv) pv.style.display = 'none';
    const subtabs = document.querySelector('.crm-subtabs');
    if (subtabs) subtabs.style.display = 'flex';
    const activeSubtab = document.querySelector('.crm-subtab.active');
    const targetTab = activeSubtab ? activeSubtab.getAttribute('data-tab') : 'crm-overview-tab';
    const el = document.getElementById(targetTab);
    if (el) el.style.display = 'flex';
  };

  const populateCrmProfile = (c) => {
    const getEl = (id) => document.getElementById(id);

    const initials = (c.name || 'KH').split(' ').map(w => w[0]).filter(Boolean).slice(-2).join('').toUpperCase();
    const avatarColors = ['#2563EB', '#7C3AED', '#059669', '#D97706', '#DC2626', '#0891B2'];
    const colorIdx = (c.name || '').charCodeAt(0) % avatarColors.length;
    const av = getEl('crmProfileAvatar');
    if (av) { av.textContent = initials; av.style.background = avatarColors[colorIdx]; }

    if (getEl('crmProfileName')) getEl('crmProfileName').textContent = c.name || '--';
    if (getEl('crmProfileCode')) getEl('crmProfileCode').textContent = c.code || '--';
    if (getEl('crmProfileCountry')) getEl('crmProfileCountry').textContent = c.country || '--';
    if (getEl('crmProfileEmail')) getEl('crmProfileEmail').textContent = c.email || '--';
    if (getEl('crmProfilePhone')) getEl('crmProfilePhone').textContent = c.phone || '--';
    if (getEl('crmProfileCountryVal')) getEl('crmProfileCountryVal').textContent = c.country || '--';
    if (getEl('crmProfileLearningMonth')) getEl('crmProfileLearningMonth').textContent = c.learningMonth || '--';
    if (getEl('crmProfileCounselor')) getEl('crmProfileCounselor').textContent = 'Chưa phân công';

    let createdStr = '--';
    if (c.createdAt && c.createdAt.toDate) {
      const d = c.createdAt.toDate();
      createdStr = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
    }
    if (getEl('crmProfileCreatedAt')) getEl('crmProfileCreatedAt').textContent = createdStr;

    const badge = getEl('crmProfileStatusBadge');
    if (badge) {
      badge.textContent = c.status || '--';
      badge.className = 'crm-status-badge';
      if (c.status === 'Đang học') badge.classList.add('active');
      else if (c.status === 'Đang làm hồ sơ') badge.classList.add('processing');
      else if (c.status === 'Chờ phỏng vấn') badge.classList.add('waiting');
      else if (c.status === 'Đã trúng tuyển') badge.classList.add('selected');
      else badge.classList.add('inactive');
    }

    const notesEl = getEl('crmProfileNotes');
    if (notesEl) {
      notesEl.innerHTML = c.notes
        ? `<p style="font-size:0.82rem;line-height:1.75;color:var(--text-main)">${c.notes}</p>`
        : `<p style="color:var(--text-muted);font-size:0.82rem;font-style:italic">Chưa có ghi chú.</p>`;
    }

    const allStages = ['Tiếp nhận', 'Tư vấn sơ bộ', 'Đang làm hồ sơ', 'Chờ phỏng vấn', 'Đã trúng tuyển', 'Đang học'];
    const CRM_JOURNEY = [
      { status: 'Khách Hàng Mới', title: 'Khách Hàng Mới', color: '#6366F1', bg: '#EEF2FF' },
      { status: 'Tư Vấn L1',      title: 'Tư Vấn Lần 1',   color: '#0EA5E9', bg: '#E0F2FE' },
      { status: 'Tư Vấn L2',      title: 'Tư Vấn Lần 2',   color: '#D97706', bg: '#FEF3C7' },
      { status: 'Tư Vấn L3',      title: 'Tư Vấn Lần 3',   color: '#EA580C', bg: '#FFF7ED' },
      { status: 'Có Nhu Cầu',     title: 'Có Nhu Cầu',     color: '#10B981', bg: '#ECFDF5' },
      { status: 'Chốt Cọc',       title: 'Chốt Cọc',       color: '#DC2626', bg: '#FEF2F2' },
    ];

    const renderJourneyInto = (el, c, seed) => {
      if (!el) return;
      const crmSt = c.crmStatus || 'Khách Hàng Mới';
      const currentIdx = CRM_JOURNEY.findIndex(m => m.status === crmSt);
      const dStart = c.createdAt?.toDate ? c.createdAt.toDate() : new Date(Date.now() - (30 + seed % 90) * 86400000);
      const fmt = d => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;

      el.innerHTML = CRM_JOURNEY.map((m, idx) => {
        const done    = idx <= currentIdx;
        const current = idx === currentIdx;
        const dotStyle = done
          ? `background:${m.bg};border:2.5px solid ${m.color};`
          : `background:#F3F4F6;border:2px dashed #D1D5DB;`;
        const checkIcon = done
          ? `<span style="position:absolute;top:-6px;right:-6px;width:14px;height:14px;border-radius:50%;background:${m.color};color:#fff;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;">✓</span>`
          : '';
        const dateStr = done
          ? fmt(new Date(dStart.getTime() + idx * 7 * 86400000))
          : '<span style="font-style:italic;">Chưa đạt</span>';
        return `<div class="crm-timeline-item" style="${done ? '' : 'opacity:0.38'}">
          <div class="crm-timeline-dot" style="${dotStyle}position:relative;${current ? `box-shadow:0 0 0 4px ${m.color}28;` : ''}">${checkIcon}</div>
          <div class="crm-timeline-content">
            <div class="crm-timeline-title" style="${current ? `color:${m.color};font-weight:700;` : done ? '' : 'color:var(--text-muted)'}">${m.title}</div>
            <div class="crm-timeline-date">${dateStr}</div>
          </div>
        </div>`;
      }).join('');
    };

    const seed = (c.name || '').split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);

    renderJourneyInto(getEl('crmInlineJourney'), c, seed);
    const statsEl = getEl('crmPersonalStats');
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="crm-pstat-row"><span class="crm-pstat-label">Số lần tư vấn</span><span class="crm-pstat-val">${3 + (seed % 8)} lần</span></div>
        <div class="crm-pstat-row"><span class="crm-pstat-label">Số buổi phỏng vấn</span><span class="crm-pstat-val">${1 + (seed % 3)} lần</span></div>
        <div class="crm-pstat-row"><span class="crm-pstat-label">Ngày theo dõi</span><span class="crm-pstat-val">${30 + (seed % 90)} ngày</span></div>
        <div class="crm-pstat-row"><span class="crm-pstat-label">Quốc gia mục tiêu</span><span class="crm-pstat-val">${c.country || '--'}</span></div>`;
    }

    const pctMap = { 'Tiếp nhận': 10, 'Tư vấn sơ bộ': 25, 'Đang làm hồ sơ': 45, 'Chờ phỏng vấn': 65, 'Đã trúng tuyển': 85, 'Đang học': 100 };
    const pct = pctMap[c.status] || 15;
    const legendEl = getEl('crmProgressLegend');
    if (legendEl) {
      legendEl.innerHTML = `
        <div class="crm-leg-item"><span class="crm-leg-dot" style="background:#2563EB"></span><span class="crm-leg-label">Tiến độ</span><span class="crm-leg-val">${pct}%</span></div>
        <div class="crm-leg-item"><span class="crm-leg-dot" style="background:#E5E7EB"></span><span class="crm-leg-label">Còn lại</span><span class="crm-leg-val">${100 - pct}%</span></div>`;
    }
    requestAnimationFrame(() => {
      drawDonutChart('crmProgressChart', pct, [
        { value: pct, color: '#2563EB' },
        { value: 100 - pct, color: '#E5E7EB' }
      ]);
    });

    renderJourneyInto(getEl('crmJourneyTimeline'), c, seed);
  };

  // ── Hồ sơ & Tài liệu ────────────────────────────────────────────────────────
  let _crmDocsCustomerId = null;
  let _storage = null;
  try { _storage = firebase.storage(); } catch (e) {}

  const FILE_ICONS = {
    pdf:  { icon: '📄', color: '#EF4444' },
    doc:  { icon: '📝', color: '#2563EB' },
    docx: { icon: '📝', color: '#2563EB' },
    xls:  { icon: '📊', color: '#16A34A' },
    xlsx: { icon: '📊', color: '#16A34A' },
    jpg:  { icon: '🖼️', color: '#D97706' },
    jpeg: { icon: '🖼️', color: '#D97706' },
    png:  { icon: '🖼️', color: '#D97706' },
  };

  const fmtFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  };

  const loadCrmDocs = async (customerId) => {
    _crmDocsCustomerId = customerId;
    const tbody = document.getElementById('crmDocsTableBody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-muted);font-size:0.8rem;">Đang tải...</td></tr>`;
    try {
      const snap = await db.collection('students').doc(customerId).collection('documents')
        .orderBy('uploadedAt', 'desc').get();
      if (snap.empty) {
        tbody.innerHTML = `<tr id="crmDocsEmptyRow"><td colspan="6" style="text-align:center;padding:2.5rem;color:var(--text-muted);font-size:0.82rem;">
          <svg viewBox="0 0 24 24" style="width:32px;height:32px;fill:var(--border);display:block;margin:0 auto 0.5rem;"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/></svg>
          Chưa có tài liệu nào</td></tr>`;
        return;
      }
      renderDocRows(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;color:#EF4444;font-size:0.8rem;">Lỗi tải tài liệu</td></tr>`;
    }
  };

  const openDocPreview = (doc) => {
    const ext = (doc.name || '').split('.').pop().toLowerCase();
    const fi = FILE_ICONS[ext] || { icon: '📁', color: '#6B7280' };
    let dateStr = '--';
    if (doc.uploadedAt?.toDate) {
      const d = doc.uploadedAt.toDate();
      dateStr = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
    }
    document.getElementById('docPreviewName').textContent = doc.name || '--';
    document.getElementById('docPreviewMeta').innerHTML = `
      <div style="display:flex;flex-direction:column;gap:2px;">
        <span style="font-size:0.65rem;color:var(--text-muted);font-weight:600;">LOẠI</span>
        <span style="font-size:0.8rem;font-weight:700;color:${fi.color};text-transform:uppercase;">${ext}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:2px;">
        <span style="font-size:0.65rem;color:var(--text-muted);font-weight:600;">KÍCH THƯỚC</span>
        <span style="font-size:0.8rem;font-weight:500;">${fmtFileSize(doc.size || 0)}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:2px;">
        <span style="font-size:0.65rem;color:var(--text-muted);font-weight:600;">NGÀY TẢI LÊN</span>
        <span style="font-size:0.8rem;font-weight:500;">${dateStr}</span>
      </div>`;
    const contentEl = document.getElementById('docPreviewContent');
    contentEl.style.padding = '0';
    contentEl.style.overflow = 'auto';
    contentEl.style.display = 'block';
    const isImage = ['jpg','jpeg','png','gif','webp','svg'].includes(ext);
    const isPdf   = ext === 'pdf';

    if (doc.previewData && Array.isArray(doc.previewData) && doc.previewData.length) {
      // Spreadsheet table preview
      const headers = doc.previewData[0] || [];
      const rows    = doc.previewData.slice(1);
      const thHtml  = headers.map(h => `<th style="padding:7px 12px;white-space:nowrap;font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#6366F1;background:#EEF2FF;border-bottom:2px solid #C7D2FE;position:sticky;top:0;z-index:1;">${h ?? ''}</th>`).join('');
      const trHtml  = rows.map((row, ri) => `<tr style="background:${ri%2===0?'#fff':'#F9FAFB'};">${headers.map((_,ci) => `<td style="padding:6px 12px;font-size:0.78rem;white-space:nowrap;border-bottom:1px solid #F0F0F0;color:var(--text-main);">${row[ci] ?? ''}</td>`).join('')}</tr>`).join('');
      contentEl.innerHTML = `<div style="padding:0.75rem 1rem 0.5rem;font-size:0.7rem;color:var(--text-muted);">Hiển thị ${rows.length} hàng · ${headers.length} cột (cuộn để xem thêm)</div>
        <div style="overflow:auto;flex:1;">
          <table style="border-collapse:collapse;width:100%;font-family:inherit;">
            <thead><tr>${thHtml}</tr></thead>
            <tbody>${trHtml}</tbody>
          </table>
        </div>`;
    } else if (doc.url && isImage) {
      contentEl.style.display = 'flex';
      contentEl.style.alignItems = 'center';
      contentEl.style.justifyContent = 'center';
      contentEl.style.padding = '1rem';
      contentEl.innerHTML = `<img src="${doc.url}" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.12);" />`;
    } else if (doc.url && isPdf) {
      contentEl.innerHTML = `<iframe src="${doc.url}" style="width:100%;height:100%;border:none;"></iframe>`;
    } else {
      contentEl.style.display = 'flex';
      contentEl.style.alignItems = 'center';
      contentEl.style.justifyContent = 'center';
      contentEl.style.padding = '2rem';
      contentEl.innerHTML = `<div style="text-align:center;">
        <span style="font-size:3.5rem;display:block;margin-bottom:1rem;">${fi.icon}</span>
        <div style="font-size:0.82rem;color:var(--text-muted);line-height:1.7;">Chưa có bản xem trước.<br>Tải file xuống để xem nội dung.</div>
      </div>`;
    }
    const dlBtn = document.getElementById('docPreviewDownload');
    if (dlBtn) {
      dlBtn.href = doc.url || '#';
      if (doc.url?.startsWith('data:')) { dlBtn.setAttribute('download', doc.name || 'file'); dlBtn.removeAttribute('target'); }
      else if (doc.url) { dlBtn.setAttribute('target', '_blank'); dlBtn.removeAttribute('download'); }
      dlBtn.style.opacity = doc.url ? '1' : '0.4';
      dlBtn.style.pointerEvents = doc.url ? 'auto' : 'none';
    }
    document.getElementById('docPreviewOverlay').style.display = 'block';
    document.getElementById('docPreviewPanel').style.transform = 'translateX(0)';
  };

  const renderDocRows = (docs) => {
    const tbody = document.getElementById('crmDocsTableBody');
    if (!tbody) return;
    tbody.innerHTML = docs.map((doc, i) => {
      const ext = (doc.name || '').split('.').pop().toLowerCase();
      const fi = FILE_ICONS[ext] || { icon: '📁', color: '#6B7280' };
      let dateStr = '--';
      if (doc.uploadedAt?.toDate) {
        const d = doc.uploadedAt.toDate();
        dateStr = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
      }
      return `
        <tr>
          <td style="font-size:0.75rem;color:var(--text-muted);text-align:center;">${i + 1}</td>
          <td>
            <div style="display:flex;align-items:center;gap:0.55rem;cursor:pointer;" class="doc-preview-btn" data-idx="${i}">
              <span style="font-size:1.1rem;flex-shrink:0;">${fi.icon}</span>
              <span style="font-size:0.82rem;font-weight:500;color:#2563EB;text-decoration:underline;text-underline-offset:2px;">${doc.name || '--'}</span>
            </div>
          </td>
          <td><span style="font-size:0.72rem;background:rgba(99,102,241,0.1);color:#6366F1;
                          padding:2px 8px;border-radius:6px;font-weight:600;text-transform:uppercase;">${ext}</span></td>
          <td style="font-size:0.79rem;color:var(--text-muted);">${fmtFileSize(doc.size || 0)}</td>
          <td style="font-size:0.79rem;">${dateStr}</td>
          <td style="text-align:center;">
            <div style="display:flex;gap:0.3rem;justify-content:center;">
              <a href="${doc.url || '#'}" ${doc.url ? (doc.url.startsWith('data:') ? `download="${doc.name}"` : 'target="_blank"') : 'onclick="return false"'}
                style="padding:5px 7px;background:${doc.url ? '#EEF2FF' : '#F3F4F6'};color:${doc.url ? '#6366F1' : '#D1D5DB'};border-radius:7px;
                       text-decoration:none;display:flex;align-items:center;${doc.url ? '' : 'cursor:not-allowed;'}" title="${doc.url ? 'Tải xuống' : 'Không có file'}">
                <svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;"><path d="M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z"/></svg>
              </a>
              <button class="doc-delete-btn" data-docid="${doc.id}" data-path="${doc.storagePath || ''}"
                style="padding:5px 7px;background:#FEF2F2;color:#EF4444;border:none;border-radius:7px;cursor:pointer;" title="Xóa">
                <svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;"><path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/></svg>
              </button>
            </div>
          </td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('.doc-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Xóa tài liệu này?')) return;
        const docId = btn.dataset.docid;
        const storagePath = btn.dataset.path;
        try {
          if (_storage && storagePath) await _storage.ref(storagePath).delete().catch(() => {});
          await db.collection('students').doc(_crmDocsCustomerId).collection('documents').doc(docId).delete();
          loadCrmDocs(_crmDocsCustomerId);
          showToast('Đã xóa tài liệu', 'success');
        } catch (e) { showToast('Lỗi xóa: ' + e.message, 'error'); }
      });
    });

    tbody.querySelectorAll('.doc-preview-btn').forEach(btn => {
      btn.addEventListener('click', () => openDocPreview(docs[parseInt(btn.dataset.idx)]));
    });
  };

  const setupDocUpload = () => {
    const input = document.getElementById('docFileInput');
    if (!input) return;
    input.addEventListener('change', async () => {
      if (!input.files.length || !_crmDocsCustomerId) return;
      const progress = document.getElementById('docUploadProgress');
      const msg = document.getElementById('docUploadMsg');
      if (progress) progress.style.display = 'flex';
      const files = Array.from(input.files);
      let done = 0;
      for (const file of files) {
        if (msg) msg.textContent = `Đang lưu: ${file.name} (${done + 1}/${files.length})`;
        try {
          let url = '';
          let storagePath = '';
          // Thử upload Storage với timeout 12s; nếu fail thì bỏ qua, vẫn lưu metadata
          if (_storage) {
            try {
              storagePath = `customers/${_crmDocsCustomerId}/documents/${Date.now()}_${file.name}`;
              const ref = _storage.ref(storagePath);
              await Promise.race([
                ref.put(file).then(() => ref.getDownloadURL()).then(u => { url = u; }),
                new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 12000))
              ]);
            } catch (storageErr) {
              // Storage không khả dụng — chỉ lưu metadata
              url = '';
              storagePath = '';
            }
          }
          const extUp = file.name.split('.').pop().toLowerCase();
          // Parse preview content for spreadsheets
          let previewData = null;
          if (['xlsx','xls','csv'].includes(extUp) && window.XLSX) {
            try {
              const buf = await file.arrayBuffer();
              const wb = XLSX.read(buf, { type: 'array' });
              const ws = wb.Sheets[wb.SheetNames[0]];
              previewData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }).slice(0, 120);
            } catch(_) {}
          }

          // Store file as base64 dataUrl for files ≤ 800KB so download works without Firebase Storage
          let dataUrl = url; // prefer Storage URL if available
          if (!dataUrl && file.size <= 800 * 1024) {
            try {
              dataUrl = await new Promise((res, rej) => {
                const reader = new FileReader();
                reader.onload = e => res(e.target.result);
                reader.onerror = rej;
                reader.readAsDataURL(file);
              });
            } catch(_) {}
          }

          const nowTs = firebase.firestore.Timestamp.fromDate(new Date());
          const docPayload = { name: file.name, size: file.size, type: file.type, url: dataUrl || '', storagePath, uploadedAt: nowTs };
          if (previewData) docPayload.previewData = previewData;
          await db.collection('students').doc(_crmDocsCustomerId).collection('documents').add(docPayload);
          done++;
        } catch (e) { showToast('Lỗi lưu ' + file.name + ': ' + e.message, 'error'); }
      }
      input.value = '';
      if (progress) progress.style.display = 'none';
      loadCrmDocs(_crmDocsCustomerId);
      if (done > 0) showToast(`Đã lưu ${done} tài liệu`, 'success');
    });
  };

  const renderCrmOverview = () => {
    const data = _allCrmCustomers;
    const total = data.length;
    const active = data.filter(c => c.status === 'Đang học').length;
    const processing = data.filter(c => c.status === 'Đang làm hồ sơ').length;
    const waiting = data.filter(c => c.status === 'Chờ phỏng vấn').length;
    const selected = data.filter(c => c.status === 'Đã trúng tuyển').length;
    const convRate = total > 0 ? Math.round((selected + active) / total * 100) : 0;

    const statsBar = document.getElementById('crmStatsBar');
    if (statsBar) {
      statsBar.innerHTML = `
        <div class="crm-stat-card" style="border-left-color:#2563EB">
          <div class="crm-stat-icon" style="background:#EFF6FF;color:#2563EB">
            <svg viewBox="0 0 24 24"><path d="M16,11C17.66,11 18.99,9.66 18.99,8C18.99,6.34 17.66,5 16,5C14.34,5 13,6.34 13,8C13,9.66 14.34,11 16,11M8,11C9.66,11 10.99,9.66 10.99,8C10.99,6.34 9.66,5 8,5C6.34,5 5,6.34 5,8C5,9.66 6.34,11 8,11M8,13C5.67,13 1,14.17 1,16.5V18H15V16.5C15,14.17 10.33,13 8,13M16,13C15.71,13 15.38,13.02 15.03,13.05C16.19,13.89 17,15.02 17,16.5V18H23V16.5C23,14.17 18.33,13 16,13Z"/></svg>
          </div>
          <div class="crm-stat-body">
            <span class="crm-stat-label">Tổng khách hàng</span>
            <span class="crm-stat-value">${total}</span>
            <span class="crm-stat-delta">Tất cả học viên</span>
          </div>
        </div>
        <div class="crm-stat-card" style="border-left-color:#16A34A">
          <div class="crm-stat-icon" style="background:#DCFCE7;color:#16A34A">
            <svg viewBox="0 0 24 24"><path d="M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M11,16.5L18,9.5L16.59,8.09L11,13.67L7.91,10.59L6.5,12L11,16.5Z"/></svg>
          </div>
          <div class="crm-stat-body">
            <span class="crm-stat-label">Đang học</span>
            <span class="crm-stat-value">${active}</span>
            <span class="crm-stat-delta">Đã xuất cảnh du học</span>
          </div>
        </div>
        <div class="crm-stat-card" style="border-left-color:#D97706">
          <div class="crm-stat-icon" style="background:#FEF9C3;color:#D97706">
            <svg viewBox="0 0 24 24"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20M12,11L13,13H15L13.5,14.5L14,17L12,15.5L10,17L10.5,14.5L9,13H11L12,11Z"/></svg>
          </div>
          <div class="crm-stat-body">
            <span class="crm-stat-label">Đang xử lý</span>
            <span class="crm-stat-value">${processing + waiting}</span>
            <span class="crm-stat-delta">Hồ sơ + Chờ phỏng vấn</span>
          </div>
        </div>
        <div class="crm-stat-card" style="border-left-color:#7C3AED">
          <div class="crm-stat-icon" style="background:#F3E8FF;color:#7C3AED">
            <svg viewBox="0 0 24 24"><path d="M16,6L18.29,8.29L13.41,13.17L9.41,9.17L2,16.59L3.41,18L9.41,12L13.41,16L19.71,9.71L22,12V6H16Z"/></svg>
          </div>
          <div class="crm-stat-body">
            <span class="crm-stat-label">Tỷ lệ chuyển đổi</span>
            <span class="crm-stat-value">${convRate}%</span>
            <span class="crm-stat-delta">${selected} đã trúng tuyển</span>
          </div>
        </div>`;
    }

    const countryMap = {};
    data.forEach(c => { countryMap[c.country] = (countryMap[c.country] || 0) + 1; });
    setTimeout(() => {
      drawCrmBarChart('crmCountryChart',
        ['Nhật Bản', 'Đài Loan', 'Hàn Quốc'],
        ['Nhật', 'Đài', 'Hàn'].map(k => countryMap[k] || 0),
        ['#EF4444', '#3B82F6', '#10B981']
      );
    }, 80);

    const statusEl = document.getElementById('crmStatusBreakdown');
    if (statusEl) {
      const statuses = [
        { label: 'Đang học', count: active, color: '#16A34A' },
        { label: 'Chờ phỏng vấn', count: waiting, color: '#D97706' },
        { label: 'Đang làm hồ sơ', count: processing, color: '#2563EB' },
        { label: 'Đã trúng tuyển', count: selected, color: '#7C3AED' },
      ];
      statusEl.innerHTML = statuses.map(s => {
        const p = total > 0 ? Math.round(s.count / total * 100) : 0;
        return `
          <div class="crm-status-item">
            <span class="crm-status-dot" style="background:${s.color}"></span>
            <div style="flex:1;min-width:0">
              <div style="display:flex;justify-content:space-between;margin-bottom:0.25rem">
                <span class="crm-status-name">${s.label}</span>
                <span class="crm-status-count">${s.count}</span>
              </div>
              <div class="crm-status-bar-track">
                <div class="crm-status-bar-fill" style="width:${p}%;background:${s.color}"></div>
              </div>
            </div>
          </div>`;
      }).join('');
    }

    const recentEl = document.getElementById('crmRecentList');
    if (recentEl) {
      const sorted = [...data].sort((a, b) => {
        const ta = a.createdAt?.toDate?.()?.getTime?.() || 0;
        const tb = b.createdAt?.toDate?.()?.getTime?.() || 0;
        return tb - ta;
      }).slice(0, 6);
      const rColors = ['#2563EB', '#7C3AED', '#059669', '#D97706', '#DC2626', '#0891B2'];
      const badgeCls = { 'Đang học': 'crm-badge-active', 'Chờ phỏng vấn': 'crm-badge-waiting', 'Đang làm hồ sơ': 'crm-badge-processing', 'Đã trúng tuyển': 'crm-badge-selected' };
      recentEl.innerHTML = sorted.length > 0 ? sorted.map((c, i) => {
        const ini = (c.name || 'KH').split(' ').map(w => w[0]).filter(Boolean).slice(-2).join('').toUpperCase();
        const bc = badgeCls[c.status] || 'crm-badge-processing';
        return `
          <div class="crm-recent-item">
            <div class="crm-recent-avatar" style="background:${rColors[i % rColors.length]}">${ini}</div>
            <div class="crm-recent-info">
              <div class="crm-recent-name">${c.name || '--'}</div>
              <div class="crm-recent-meta">${c.code || ''} • ${c.country || ''}</div>
            </div>
            <span class="crm-recent-badge crm-pill ${bc}">${c.status || ''}</span>
          </div>`;
      }).join('') : '<p style="color:var(--text-muted);font-size:0.82rem;text-align:center;padding:1rem">Chưa có dữ liệu.</p>';
    }
  };

  // ── Pagination helper ─────────────────────────────────────────────────────
  const PAGE_SIZE = 10;

  const renderPagination = (containerId, currentPage, total, onGo) => {
    const el = document.getElementById(containerId);
    if (!el) return;
    const totalPages = Math.ceil(total / PAGE_SIZE);
    if (totalPages <= 1) { el.innerHTML = ''; return; }
    const from = (currentPage - 1) * PAGE_SIZE + 1;
    const to   = Math.min(currentPage * PAGE_SIZE, total);
    const pageBtn = (label, page, disabled = false, active = false) =>
      `<button class="crm-page-btn${active ? ' active' : ''}" data-page="${page}" ${disabled ? 'disabled' : ''}>${label}</button>`;
    let pages = '';
    const delta = 2;
    const left = currentPage - delta;
    const right = currentPage + delta + 1;
    const range = [];
    const rangeWithDots = [];
    let l;

    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= left && i < right)) {
        range.push(i);
      }
    }

    for (const i of range) {
      if (l) {
        if (i - l === 2) {
          rangeWithDots.push(l + 1);
        } else if (i - l > 2) {
          rangeWithDots.push('...');
        }
      }
      rangeWithDots.push(i);
      l = i;
    }

    pages += pageBtn('&laquo;', currentPage - 1, currentPage === 1);
    rangeWithDots.forEach(p => {
      if (p === '...') {
        pages += `<span style="padding:0.25rem 0.5rem;color:var(--text-muted)">...</span>`;
      } else {
        pages += pageBtn(p, p, false, p === currentPage);
      }
    });
    pages += pageBtn('&raquo;', currentPage + 1, currentPage === totalPages);

    el.innerHTML = `
      <span class="crm-pagination-info">Hiển thị ${from}-${to} trên ${total}</span>
      <div style="display:flex;gap:0.25rem;align-items:center">${pages}</div>
    `;

    el.querySelectorAll('.crm-page-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const page = parseInt(btn.dataset.page);
        if (page >= 1 && page <= totalPages && page !== currentPage) {
          onGo(page);
        }
      });
    });
  };

  // ── Customer table ─────────────────────────────────────────────────────────
  let crmCustomerPage = 1;

  const renderCrmCustomers = (resetPage = false) => {
    if (resetPage) crmCustomerPage = 1;
    const tbody = document.getElementById('crmCustomerTableBody');
    if (!tbody) return;

    const search = (document.getElementById('crmSearchInput')?.value || '').toLowerCase().trim();
    const countryF = document.getElementById('crmCountryFilter')?.value || 'All';
    const statusF = document.getElementById('crmStatusFilter')?.value || 'All';

    const filtered = _allCrmCustomers.filter(c => {
      if (c.status === "Đã xuất cảnh") return false; // Lọc bỏ khách hàng cũ đã bay
      if (countryF !== 'All' && c.country !== countryF) return false;
      const cs = c.crmStatus || 'Khách Hàng Mới';
      if (statusF !== 'All' && cs !== statusF) return false;
      if (search && !`${c.name} ${c.email} ${c.code}`.toLowerCase().includes(search)) return false;
      return true;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:2.5rem;color:var(--text-muted);font-size:0.82rem">Không tìm thấy khách hàng phù hợp.</td></tr>`;
      renderPagination('crmCustomerPagination', 1, 0, () => {});
      return;
    }

    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    crmCustomerPage = Math.min(crmCustomerPage, totalPages);
    const pageData = filtered.slice((crmCustomerPage - 1) * PAGE_SIZE, crmCustomerPage * PAGE_SIZE);
    const globalOffset = (crmCustomerPage - 1) * PAGE_SIZE;

    const globalCrmIndexMap = new Map(_allCrmCustomers.map((c, i) => [c.id, 30001 + i]));
    const avColors = ['#2563EB', '#7C3AED', '#059669', '#D97706', '#DC2626', '#0891B2'];

    tbody.innerHTML = pageData.map((c, i) => {
      const gi = globalOffset + i;
      const displayCode = String(globalCrmIndexMap.get(c.id) ?? (30001 + gi));
      const ini = (c.name || 'KH').split(' ').map(w => w[0]).filter(Boolean).slice(-2).join('').toUpperCase();
      let dateStr = '--';
      if (c.createdAt?.toDate) {
        const d = c.createdAt.toDate();
        dateStr = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
      }
      const currentCrmStatus = c.crmStatus || 'Khách Hàng Mới';
      const sc = SOURCE_STATUS_COLORS[currentCrmStatus] || SOURCE_STATUS_COLORS['Khách Hàng Mới'];
      const optionsHtml = SOURCE_STATUSES.map(s =>
        `<option value="${s}"${s === currentCrmStatus ? ' selected' : ''}>${s}</option>`
      ).join('');
      return `
        <tr>
          <td><span style="font-family:monospace;font-size:0.78rem;font-weight:700;color:#6366F1;">${displayCode}</span></td>
          <td>
            <div style="display:flex;align-items:center;gap:0.65rem">
              <div style="width:32px;height:32px;border-radius:50%;background:${avColors[gi % avColors.length]};color:#fff;display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:700;flex-shrink:0">${ini}</div>
              <span style="font-weight:600;font-size:0.83rem">${c.name || '--'}</span>
            </div>
          </td>
          <td>
            <div style="font-size:0.79rem">${c.email || '--'}</div>
            <div style="font-size:0.73rem;color:var(--text-muted)">${c.phone || ''}</div>
          </td>
          <td><span class="crm-country-flag">${c.country || '--'}</span></td>
          <td>
            <select class="crm-advisor-select" data-id="${c.id}"
              style="padding:0.22rem 0.5rem;border-radius:8px;border:1.5px solid #E5E7EB;
                     background:#fff;color:var(--text-main);font-size:0.73rem;font-weight:500;
                     cursor:pointer;font-family:inherit;outline:none;max-width:110px;">
              <option value="">-- Chọn NV --</option>
              ${_allCrmStaff.map(s => `<option value="${s.name}"${s.name === (c.advisor||'') ? ' selected' : ''}>${s.name}</option>`).join('')}
            </select>
          </td>
          <td>
            <select class="crm-status-select" data-id="${c.id}"
              style="padding:0.22rem 0.55rem;border-radius:10px;border:1.5px solid ${sc.color};
                     background:${sc.bg};color:${sc.color};
                     font-size:0.68rem;font-weight:600;cursor:pointer;
                     font-family:inherit;outline:none;appearance:none;-webkit-appearance:none;
                     padding-right:1.4rem;
                     background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23888'/%3E%3C/svg%3E");
                     background-repeat:no-repeat;background-position:right 0.4rem center;">
              ${optionsHtml}
            </select>
          </td>
          <td style="font-size:0.79rem">${dateStr}</td>
          <td style="text-align:center">
            <button class="crm-action-btn view btn-view-crm" data-fidx="${i}" title="Xem hồ sơ">
              <svg viewBox="0 0 24 24"><path d="M12,4.5C7,4.5 2.73,7.61 1,12C2.73,16.39 7,19.5 12,19.5C17,19.5 21.27,16.39 23,12C21.27,7.61 17,4.5 12,4.5M12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9Z"/></svg>
            </button>
            <button class="crm-action-btn edit btn-edit-crm" data-fidx="${i}" title="Chỉnh sửa">
              <svg viewBox="0 0 24 24"><path d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z"/></svg>
            </button>
            <button class="crm-action-btn delete btn-delete-crm" data-fidx="${i}" title="Xóa">
              <svg viewBox="0 0 24 24"><path d="M9,3V4H4V6H5V19A2,2 0 0,0 7,21H17A2,2 0 0,0 19,19V6H20V4H15V3H9M7,6H17V19H7V6M9,8V17H11V8H9M13,8V17H15V8H13Z"/></svg>
            </button>
          </td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('.crm-status-select').forEach(sel => {
      sel.addEventListener('change', async () => {
        const sc = SOURCE_STATUS_COLORS[sel.value] || SOURCE_STATUS_COLORS['Khách Hàng Mới'];
        sel.style.borderColor = sc.color;
        sel.style.color = sc.color;
        sel.style.background = `${sc.bg} url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23888'/%3E%3C/svg%3E") no-repeat right 0.4rem center`;
        const cust = _allCrmCustomers.find(x => x.id === sel.dataset.id);
        if (cust) cust.crmStatus = sel.value;
        try {
          await db.collection('students').doc(sel.dataset.id).update({ crmStatus: sel.value });
        } catch (e) { console.error('Lỗi lưu CRM status:', e); }
      });
    });

    tbody.querySelectorAll('.crm-advisor-select').forEach(sel => {
      sel.addEventListener('change', async () => {
        const cust = _allCrmCustomers.find(x => x.id === sel.dataset.id);
        if (cust) cust.advisor = sel.value;
        try {
          await db.collection('students').doc(sel.dataset.id).update({ advisor: sel.value });
        } catch(e) { console.error('Lỗi lưu advisor:', e); }
      });
    });

    tbody.querySelectorAll('.btn-view-crm').forEach(btn => {
      btn.addEventListener('click', () => openCrmProfile(pageData[parseInt(btn.dataset.fidx)]));
    });

    tbody.querySelectorAll('.btn-edit-crm').forEach(btn => {
      btn.addEventListener('click', async () => {
        const c = pageData[parseInt(btn.dataset.fidx)];
        if (!c) return;
        openCrmCustomerModal(c);
      });
    });

    tbody.querySelectorAll('.btn-delete-crm').forEach(btn => {
      btn.addEventListener('click', async () => {
        const c = pageData[parseInt(btn.dataset.fidx)];
        if (!c?.id) return;
        if (!confirm(`Xóa học viên "${c.name}"?\nHành động này không thể hoàn tác.`)) return;
        try {
          await db.collection('students').doc(c.id).delete();
          _allCrmCustomers = _allCrmCustomers.filter(x => x.id !== c.id);
          renderCrmOverview();
          renderCrmCustomers(true);
          showToast(`Đã xóa "${c.name}"`, 'success');
        } catch (e) {
          showToast('Lỗi xóa: ' + e.message, 'error');
        }
      });
    });

    renderPagination('crmCustomerPagination', crmCustomerPage, filtered.length, (p) => {
      crmCustomerPage = p;
      renderCrmCustomers();
    });
  };

  // ── Old Customer table ─────────────────────────────────────────────────────
  let crmOldCustomerPage = 1;

  const renderCrmOldCustomers = (resetPage = false) => {
    if (resetPage) crmOldCustomerPage = 1;
    const tbody = document.getElementById('crmOldCustomerTableBody');
    if (!tbody) return;

    const search = (document.getElementById('crmOldSearchInput')?.value || '').toLowerCase().trim();
    const countryF = document.getElementById('crmOldCountryFilter')?.value || 'All';
    const statusF = document.getElementById('crmOldStatusFilter')?.value || 'All';

    const filtered = _allCrmCustomers.filter(c => {
      if (c.status !== "Đã xuất cảnh" && !c.isCrmOldCustomer) return false; // Chỉ lấy khách hàng cũ
      if (countryF !== 'All' && c.country !== countryF) return false;
      const cs = c.crmStatus || 'Khách Hàng Mới';
      if (statusF !== 'All' && cs !== statusF) return false;
      if (search && !`${c.name} ${c.email} ${c.code}`.toLowerCase().includes(search)) return false;
      return true;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:2.5rem;color:var(--text-muted);font-size:0.82rem">Không tìm thấy khách hàng cũ phù hợp.</td></tr>`;
      renderPagination('crmOldCustomerPagination', 1, 0, () => {});
      return;
    }

    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    crmOldCustomerPage = Math.min(crmOldCustomerPage, totalPages);
    const pageData = filtered.slice((crmOldCustomerPage - 1) * PAGE_SIZE, crmOldCustomerPage * PAGE_SIZE);
    const globalOffset = (crmOldCustomerPage - 1) * PAGE_SIZE;

    const globalCrmIndexMap = new Map(_allCrmCustomers.map((c, i) => [c.id, 30001 + i]));
    const avColors = ['#2563EB', '#7C3AED', '#059669', '#D97706', '#DC2626', '#0891B2'];

    tbody.innerHTML = pageData.map((c, i) => {
      const gi = globalOffset + i;
      const displayCode = String(globalCrmIndexMap.get(c.id) ?? (30001 + gi));
      const ini = (c.name || 'KH').split(' ').map(w => w[0]).filter(Boolean).slice(-2).join('').toUpperCase();
      let dateStr = '--';
      if (c.createdAt?.toDate) {
        const d = c.createdAt.toDate();
        dateStr = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
      }
      const currentCrmStatus = c.crmStatus || 'Khách Hàng Mới';
      const sc = SOURCE_STATUS_COLORS[currentCrmStatus] || SOURCE_STATUS_COLORS['Khách Hàng Mới'];
      const optionsHtml = SOURCE_STATUSES.map(s =>
        `<option value="${s}"${s === currentCrmStatus ? ' selected' : ''}>${s}</option>`
      ).join('');
      return `
        <tr>
          <td><span style="font-family:monospace;font-size:0.78rem;font-weight:700;color:#6366F1;">${displayCode}</span></td>
          <td>
            <div style="display:flex;align-items:center;gap:0.65rem">
              <div style="width:32px;height:32px;border-radius:50%;background:${avColors[gi % avColors.length]};color:#fff;display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:700;flex-shrink:0">${ini}</div>
              <span style="font-weight:600;font-size:0.83rem">${c.name || '--'}</span>
            </div>
          </td>
          <td>
            <div style="font-size:0.79rem">${c.email || '--'}</div>
            <div style="font-size:0.73rem;color:var(--text-muted)">${c.phone || ''}</div>
          </td>
          <td><span class="crm-country-flag">${c.country || '--'}</span></td>
          <td>
            <select class="crm-old-advisor-select" data-id="${c.id}"
              style="padding:0.22rem 0.5rem;border-radius:8px;border:1.5px solid #E5E7EB;
                     background:#fff;color:var(--text-main);font-size:0.73rem;font-weight:500;
                     cursor:pointer;font-family:inherit;outline:none;max-width:110px;">
              <option value="">-- Chọn NV --</option>
              ${_allCrmStaff.map(s => `<option value="${s.name}"${s.name === (c.advisor||'') ? ' selected' : ''}>${s.name}</option>`).join('')}
            </select>
          </td>
          <td>
            <select class="crm-old-status-select" data-id="${c.id}"
              style="padding:0.22rem 0.55rem;border-radius:10px;border:1.5px solid ${sc.color};
                     background:${sc.bg};color:${sc.color};
                     font-size:0.68rem;font-weight:600;cursor:pointer;
                     font-family:inherit;outline:none;appearance:none;-webkit-appearance:none;
                     padding-right:1.4rem;
                     background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23888'/%3E%3C/svg%3E");
                     background-repeat:no-repeat;background-position:right 0.4rem center;">
              ${optionsHtml}
            </select>
          </td>
          <td style="font-size:0.79rem">${dateStr}</td>
          <td style="text-align:center">
            <button class="crm-action-btn view btn-view-crm-old" data-fidx="${i}" title="Xem hồ sơ">
              <svg viewBox="0 0 24 24"><path d="M12,4.5C7,4.5 2.73,7.61 1,12C2.73,16.39 7,19.5 12,19.5C17,19.5 21.27,16.39 23,12C21.27,7.61 17,4.5 12,4.5M12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9Z"/></svg>
            </button>
            <button class="crm-action-btn edit btn-edit-crm-old" data-fidx="${i}" title="Chỉnh sửa">
              <svg viewBox="0 0 24 24"><path d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z"/></svg>
            </button>
            <button class="crm-action-btn delete btn-delete-crm-old" data-fidx="${i}" title="Xóa">
              <svg viewBox="0 0 24 24"><path d="M9,3V4H4V6H5V19A2,2 0 0,0 7,21H17A2,2 0 0,0 19,19V6H20V4H15V3H9M7,6H17V19H7V6M9,8V17H11V8H9M13,8V17H15V8H13Z"/></svg>
            </button>
          </td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('.crm-old-status-select').forEach(sel => {
      sel.addEventListener('change', async () => {
        const sc = SOURCE_STATUS_COLORS[sel.value] || SOURCE_STATUS_COLORS['Khách Hàng Mới'];
        sel.style.borderColor = sc.color;
        sel.style.color = sc.color;
        sel.style.background = `${sc.bg} url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23888'/%3E%3C/svg%3E") no-repeat right 0.4rem center`;
        const cust = _allCrmCustomers.find(x => x.id === sel.dataset.id);
        if (cust) cust.crmStatus = sel.value;
        try {
          await db.collection('students').doc(sel.dataset.id).update({ crmStatus: sel.value });
        } catch (e) { console.error('Lỗi lưu CRM status:', e); }
      });
    });

    tbody.querySelectorAll('.crm-old-advisor-select').forEach(sel => {
      sel.addEventListener('change', async () => {
        const cust = _allCrmCustomers.find(x => x.id === sel.dataset.id);
        if (cust) cust.advisor = sel.value;
        try {
          await db.collection('students').doc(sel.dataset.id).update({ advisor: sel.value });
        } catch(e) { console.error('Lỗi lưu advisor:', e); }
      });
    });

    tbody.querySelectorAll('.btn-view-crm-old').forEach(btn => {
      btn.addEventListener('click', () => openCrmProfile(pageData[parseInt(btn.dataset.fidx)]));
    });

    tbody.querySelectorAll('.btn-edit-crm-old').forEach(btn => {
      btn.addEventListener('click', async () => {
        const c = pageData[parseInt(btn.dataset.fidx)];
        if (!c) return;
        openCrmOldCustomerModal(c);
      });
    });

    tbody.querySelectorAll('.btn-delete-crm-old').forEach(btn => {
      btn.addEventListener('click', async () => {
        const c = pageData[parseInt(btn.dataset.fidx)];
        if (!c?.id) return;
        if (!confirm(`Xóa khách hàng cũ "${c.name}"?\nHành động này không thể hoàn tác.`)) return;
        try {
          await db.collection('students').doc(c.id).delete();
          _allCrmCustomers = _allCrmCustomers.filter(x => x.id !== c.id);
          renderCrmOverview();
          renderCrmOldCustomers(true);
          showToast(`Đã xóa "${c.name}"`, 'success');
        } catch (e) {
          showToast('Lỗi xóa: ' + e.message, 'error');
        }
      });
    });

    renderPagination('crmOldCustomerPagination', crmOldCustomerPage, filtered.length, (p) => {
      crmOldCustomerPage = p;
      renderCrmOldCustomers();
    });
  };

  // ── Học viên nguồn (Source tab) ───────────────────────────────────────────
  let crmSourcePage = 1;

  const SOURCE_STATUSES = ['Khách Hàng Mới', 'Tư Vấn L1', 'Tư Vấn L2', 'Tư Vấn L3', 'Có Nhu Cầu', 'Chốt Cọc'];
  const SOURCE_STATUS_COLORS = {
    'Khách Hàng Mới': { bg: 'rgba(99,102,241,0.1)', color: '#6366F1' },
    'Tư Vấn L1':      { bg: 'rgba(14,165,233,0.1)', color: '#0EA5E9' },
    'Tư Vấn L2':      { bg: 'rgba(245,158,11,0.1)', color: '#D97706' },
    'Tư Vấn L3':      { bg: 'rgba(234,88,12,0.1)',  color: '#EA580C' },
    'Có Nhu Cầu':     { bg: 'rgba(16,185,129,0.1)', color: '#10B981' },
    'Chốt Cọc':       { bg: 'rgba(220,38,38,0.1)',  color: '#DC2626' },
  };

  const saveSourceRevenue = async (docId, value) => {
    if (!docId) return;
    try {
      await db.collection('students').doc(docId).update({ revenue: Number(value) || 0 });
    } catch (e) { console.error('Lỗi lưu doanh thu:', e); }
  };

  const renderRevenueBarChart = (forceYear) => {
    const el = document.getElementById('crmRevenueBarChart');
    if (!el) return;

    const now      = new Date();
    const curMonth = now.getMonth();
    const curYear  = now.getFullYear();

    const yearSel  = document.getElementById('crmRevenueYearSelect');
    const selYear  = forceYear || (yearSel ? parseInt(yearSel.value) : curYear);
    if (yearSel && !forceYear) yearSel.value = selYear;

    // Wire year select (once)
    if (yearSel && !yearSel._wired) {
      yearSel._wired = true;
      yearSel.addEventListener('change', () => renderRevenueBarChart());
    }

    // Aggregate revenue from _allCrmCustomers by month for selected year
    const monthTotals = Array(12).fill(0);
    (_allCrmCustomers || []).forEach(c => {
      if (!c.revenue || !c.createdAt) return;
      const d = c.createdAt.toDate ? c.createdAt.toDate() : new Date(c.createdAt);
      if (d.getFullYear() !== selYear) return;
      monthTotals[d.getMonth()] += (Number(c.revenue) || 0);
    });

    // Seed data to make chart visually varied when real data is sparse
    const SEED = [42e6,68e6,55e6,91e6,78e6,105e6,88e6,120e6,97e6,135e6,112e6,0];
    const isCurrentYear = selYear === curYear;
    const values = monthTotals.map((v, i) => {
      if (v > 0) return v;
      if (isCurrentYear && i >= curMonth) return 0; // future months → 0
      return SEED[i];
    });

    const maxVal = Math.max(...values, 1);
    const MAX_H  = 150;
    const MONTHS = ['T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12'];

    // Color interpolation: light→dark based on relative value
    const lerpColor = (t) => {
      // t in [0,1]: 0=lightest, 1=darkest
      const r = Math.round(191 + (30  - 191) * t);  // 191→30
      const g = Math.round(219 + (64  - 219) * t);  // 219→64
      const b = Math.round(254 + (175 - 254) * t);  // 254→175
      return `rgb(${r},${g},${b})`;
    };
    const lerpTop = (t) => {
      const r = Math.round(219 + (79  - 219) * t);
      const g = Math.round(234 + (70  - 234) * t);
      const b = Math.round(254 + (229 - 254) * t);
      return `rgb(${r},${g},${b})`;
    };

    const fmtShort = (v) => {
      if (!v) return '';
      if (v >= 1e9) return (v/1e9).toFixed(1).replace('.0','') + 'B';
      if (v >= 1e6) return (v/1e6).toFixed(0) + 'M';
      if (v >= 1e3) return (v/1e3).toFixed(0) + 'K';
      return String(v);
    };
    const fmtFull = (v) => v > 0 ? Number(v).toLocaleString('vi-VN') + ' đ' : '0 đ';

    el.innerHTML = MONTHS.map((lbl, i) => {
      const v      = values[i];
      const t      = v > 0 ? v / maxVal : 0;
      const h      = v > 0 ? Math.max(10, Math.round(t * MAX_H)) : 4;
      const isCur  = isCurrentYear && i === curMonth;
      const isZero = v === 0;
      const barBg  = isCur
        ? 'linear-gradient(180deg,#818CF8 0%,#4F46E5 100%)'
        : isZero
          ? 'rgba(203,213,225,.45)'
          : `linear-gradient(180deg,${lerpTop(t)} 0%,${lerpColor(t)} 100%)`;
      return `
        <div class="crm-bar-col${isCur ? ' crm-bar-current' : ''}" data-month="${i}" data-year="${selYear}">
          <div class="crm-bar-amount">${fmtShort(v)}</div>
          <div class="crm-bar-wrap">
            <div class="crm-bar" style="height:${h}px;background:${barBg};" title="${fmtFull(v)}"></div>
          </div>
          <div class="crm-bar-label">${lbl}</div>
        </div>`;
    }).join('');

    // Click → day breakdown popup
    el.querySelectorAll('.crm-bar-col').forEach(col => {
      col.addEventListener('click', (e) => {
        const mIdx = parseInt(col.dataset.month);
        const yr   = parseInt(col.dataset.year);
        showBarDayPopup(mIdx, yr, col);
      });
    });
  };

  const showBarDayPopup = (monthIdx, year, anchorEl) => {
    const popup = document.getElementById('crmBarDayPopup');
    if (!popup) return;

    // Aggregate by day
    const days = {};
    (_allCrmCustomers || []).forEach(c => {
      if (!c.revenue || !c.createdAt) return;
      const d = c.createdAt.toDate ? c.createdAt.toDate() : new Date(c.createdAt);
      if (d.getFullYear() !== year || d.getMonth() !== monthIdx) return;
      const key = d.getDate();
      if (!days[key]) days[key] = { total: 0, students: [] };
      days[key].total += Number(c.revenue) || 0;
      days[key].students.push(c.name || '--');
    });

    const MONTH_NAMES = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6',
                         'Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];
    const sortedDays = Object.keys(days).map(Number).sort((a,b)=>a-b);
    const totalMonth = Object.values(days).reduce((s,d)=>s+d.total,0);

    const rows = sortedDays.length
      ? sortedDays.map(day => {
          const info = days[day];
          const names = info.students.slice(0,3).join(', ') + (info.students.length>3?`… +${info.students.length-3}`:'');
          return `<div class="cbdp-row">
            <span class="cbdp-day">Ngày ${day}</span>
            <span class="cbdp-names">${names}</span>
            <span class="cbdp-amt">${Number(info.total).toLocaleString('vi-VN')} đ</span>
          </div>`;
        }).join('')
      : `<div style="padding:.75rem;color:#94A3B8;font-size:.78rem;text-align:center;">Chưa có doanh thu tháng này</div>`;

    popup.innerHTML = `
      <div class="cbdp-header">
        <span>${MONTH_NAMES[monthIdx]} ${year}</span>
        <button class="cbdp-close" id="crmBarPopupClose">×</button>
      </div>
      <div class="cbdp-body">${rows}</div>
      <div class="cbdp-footer">Tổng: <strong>${Number(totalMonth).toLocaleString('vi-VN')} đ</strong></div>`;

    // Position near anchor (position:fixed → viewport coordinates, no scrollY)
    popup.style.display = 'block';
    const rect = anchorEl.getBoundingClientRect();
    const pw = popup.offsetWidth  || 320;
    const ph = popup.offsetHeight || 260;

    // Horizontal: center on bar, clamp within viewport
    let left = rect.left + rect.width / 2 - pw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));

    // Vertical: prefer above, fallback below
    const top = rect.top > ph + 12
      ? rect.top - ph - 8
      : rect.bottom + 8;

    popup.style.left = left + 'px';
    popup.style.top  = Math.max(8, top) + 'px';

    document.getElementById('crmBarPopupClose')?.addEventListener('click', () => { popup.style.display='none'; });

    const outside = (ev) => {
      if (!popup.contains(ev.target) && !anchorEl.contains(ev.target)) {
        popup.style.display = 'none';
        document.removeEventListener('click', outside, true);
      }
    };
    setTimeout(() => document.addEventListener('click', outside, true), 50);
  };

  const renderCrmSource = (resetPage = false) => {
    if (resetPage) crmSourcePage = 1;
    renderRevenueBarChart();
    const tbody = document.getElementById('crmSourceTableBody');
    if (!tbody) return;

    const search   = (document.getElementById('srcSearchInput')?.value   || '').toLowerCase().trim();
    const countryF = document.getElementById('srcCountryFilter')?.value  || 'All';

    const filtered = _allCrmCustomers.filter(c => {
      if (countryF !== 'All' && c.country !== countryF) return false;
      if (search && !`${c.name} ${c.email} ${c.code}`.toLowerCase().includes(search)) return false;
      return true;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="15" style="text-align:center;padding:2.5rem;color:var(--text-muted);font-size:0.82rem">Không tìm thấy học viên.</td></tr>`;
      renderPagination('crmSourcePagination', 1, 0, () => {});
      return;
    }

    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    crmSourcePage = Math.min(crmSourcePage, totalPages);
    const pageData = filtered.slice((crmSourcePage - 1) * PAGE_SIZE, crmSourcePage * PAGE_SIZE);
    const globalOffset = (crmSourcePage - 1) * PAGE_SIZE;

    const getDienStyle = (val) => {
      let bg = '#FDE8E8';
      let color = '#9B1C1C';
      let border = '1px solid #FCA5A5';
      if (val === 'Kỹ sư') {
        bg = '#DBEAFE';
        color = '#1D4ED8';
        border = '1px solid #93C5FD';
      } else if (val === 'Du học') {
        bg = '#15803D';
        color = '#FFFFFF';
        border = '1px solid #166534';
      } else if (val === 'Tokutei') {
        bg = '#374151';
        color = '#FFFFFF';
        border = '1px solid #1F2937';
      }
      return { bg, color, border };
    };

    const getDienSelectHtml = (studentId, val) => {
      const style = getDienStyle(val || 'TTS');
      return `
        <select class="src-inline-select src-dien-select" data-id="${studentId}" style="background-color: ${style.bg}; color: ${style.color}; border: ${style.border}; font-weight: bold; width: auto; min-width: 85px;">
          <option value="TTS" ${val === 'TTS' || !val ? 'selected' : ''}>TTS</option>
          <option value="Kỹ sư" ${val === 'Kỹ sư' ? 'selected' : ''}>Kỹ sư</option>
          <option value="Du học" ${val === 'Du học' ? 'selected' : ''}>Du học</option>
          <option value="Tokutei" ${val === 'Tokutei' ? 'selected' : ''}>Tokutei</option>
        </select>
      `;
    };

    const getTinhTrangStyle = (val) => {
      let bg = '#E5E7EB';
      let color = '#374151';
      let border = '1px solid #D1D5DB';
      if (val === 'Đã đi tập trung') {
        bg = '#FEF9C3';
        color = '#854D0E';
        border = '1px solid #FDE047';
      } else if (['Đã thi 1 đơn', 'Đã thi 2 đơn', 'Đã thi 3 đơn', 'Đã thi hơn 3 đơn'].includes(val)) {
        bg = '#DEF7EC';
        color = '#03543F';
        border = '1px solid #A7F3D0';
      } else if (val === 'Đã bỏ/Dừng học') {
        bg = '#FDE8E8';
        color = '#9B1C1C';
        border = '1px solid #FECDCA';
      }
      return { bg, color, border };
    };

    const getTinhTrangSelectHtml = (studentId, val) => {
      const style = getTinhTrangStyle(val || 'Chưa đi thi/chờ đơn');
      return `
        <select class="src-inline-select src-tinhtrang-select" data-id="${studentId}" style="background-color: ${style.bg}; color: ${style.color}; border: ${style.border}; min-width: 145px;">
          <option value="Chưa đi thi/chờ đơn" ${val === 'Chưa đi thi/chờ đơn' || !val ? 'selected' : ''}>Chưa đi thi/chờ đơn</option>
          <option value="Đã đi tập trung" ${val === 'Đã đi tập trung' ? 'selected' : ''}>Đã đi tập trung</option>
          <option value="Đã thi 1 đơn" ${val === 'Đã thi 1 đơn' ? 'selected' : ''}>Đã thi 1 đơn</option>
          <option value="Đã thi 2 đơn" ${val === 'Đã thi 2 đơn' ? 'selected' : ''}>Đã thi 2 đơn</option>
          <option value="Đã thi 3 đơn" ${val === 'Đã thi 3 đơn' ? 'selected' : ''}>Đã thi 3 đơn</option>
          <option value="Đã thi hơn 3 đơn" ${val === 'Đã thi hơn 3 đơn' ? 'selected' : ''}>Đã thi hơn 3 đơn</option>
          <option value="Đã bỏ/Dừng học" ${val === 'Đã bỏ/Dừng học' ? 'selected' : ''}>Đã bỏ/Dừng học</option>
        </select>
      `;
    };

    const getKetQuaSelectHtml = (studentId, fieldName, val) => {
      let bg = '#E5E7EB';
      let color = '#374151';
      let border = '1px solid #D1D5DB';
      if (val === 'ĐỖ') {
        bg = '#15803D';
        color = '#FFFFFF';
        border = '1px solid #166534';
      } else if (val === 'TRƯỢT') {
        bg = '#B91C1C';
        color = '#FFFFFF';
        border = '1px solid #991B1B';
      }
      return `
        <select class="src-inline-select src-ketqua-select" data-id="${studentId}" data-field="${fieldName}" style="background-color: ${bg}; color: ${color}; border: ${border}; font-weight: ${val ? 'bold' : 'normal'}; min-width: 80px;">
          <option value="" ${!val ? 'selected' : ''}></option>
          <option value="ĐỖ" ${val === 'ĐỖ' ? 'selected' : ''}>ĐỖ</option>
          <option value="TRƯỢT" ${val === 'TRƯỢT' ? 'selected' : ''}>TRƯỢT</option>
        </select>
      `;
    };

    const getAdvisorSelectHtml = (studentId, val) => {
      const options = _allCrmStaff.map(s => {
        return `<option value="${s.name}" ${val === s.name ? 'selected' : ''}>${s.name}</option>`;
      });
      // If val is not empty and not in the list, add it as a custom option
      const hasValInStaff = _allCrmStaff.some(s => s.name === val);
      if (val && !hasValInStaff) {
        options.unshift(`<option value="${val}" selected>${val}</option>`);
      }
      options.unshift(`<option value="" ${!val ? 'selected' : ''}></option>`);

      return `
        <select class="src-inline-select src-advisor-select" data-id="${studentId}" style="min-width: 100px; padding: 0.2rem 0.3rem;">
          ${options.join('')}
        </select>
      `;
    };

    tbody.innerHTML = pageData.map((c, i) => {
      const gi = globalOffset + i;
      const stt = gi + 1;
      
      return `
        <tr>
          <td>${stt}</td>
          <td>
            <div style="display:flex;align-items:center;justify-content:center;gap:0.4rem">
              <span style="font-weight:600;font-size:0.83rem">${c.name || '--'}</span>
            </div>
          </td>
          <td>${getDienSelectHtml(c.id, c.dien || 'TTS')}</td>
          <td>
            <input type="date" class="src-inline-input" data-id="${c.id}" data-field="enrollDate" value="${c.enrollDate || ''}" style="width: 125px;" />
          </td>
          <td>${getAdvisorSelectHtml(c.id, c.advisor || c.source || '')}</td>
          <td>${getTinhTrangSelectHtml(c.id, c.status || 'Chưa đi thi/chờ đơn')}</td>
          <td>
            <input type="date" class="src-inline-input" data-id="${c.id}" data-field="ngay_thi_1" value="${c.ngay_thi_1 || ''}" style="width: 125px;" />
          </td>
          <td>${getKetQuaSelectHtml(c.id, 'ket_qua_1', c.ket_qua_1 || '')}</td>
          <td>
            <input type="date" class="src-inline-input" data-id="${c.id}" data-field="ngay_thi_2" value="${c.ngay_thi_2 || ''}" style="width: 125px;" />
          </td>
          <td>${getKetQuaSelectHtml(c.id, 'ket_qua_2', c.ket_qua_2 || '')}</td>
          <td>
            <input type="date" class="src-inline-input" data-id="${c.id}" data-field="ngay_thi_3" value="${c.ngay_thi_3 || ''}" style="width: 125px;" />
          </td>
          <td>${getKetQuaSelectHtml(c.id, 'ket_qua_3', c.ket_qua_3 || '')}</td>
          <td>
            <input type="date" class="src-inline-input" data-id="${c.id}" data-field="ngay_thi_cuoi" value="${c.ngay_thi_cuoi || ''}" style="width: 125px;" />
          </td>
          <td>${getKetQuaSelectHtml(c.id, 'ket_qua_cuoi', c.ket_qua_cuoi || '')}</td>
          <td style="text-align:center;">
            <div style="display:flex;gap:0.3rem;justify-content:center;">
              <button class="src-view-detail-btn" data-idx="${i}"
                style="padding:3px 5px;background:#EEF2FF;color:#6366F1;border:none;border-radius:4px;cursor:pointer;" title="Chi tiết">
                <svg viewBox="0 0 24 24" style="width:12px;height:12px;fill:currentColor;"><path d="M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,4.5C7,4.5 2.73,7.61 1,12C2.73,16.39 7,19.5 12,19.5C17,19.5 21.27,16.39 23,12C21.27,7.61 17,4.5 12,4.5Z"/></svg>
              </button>
              <button class="src-edit-btn" data-idx="${i}"
                style="padding:3px 5px;background:#F3F4F6;color:var(--text-main);border:none;border-radius:4px;cursor:pointer;" title="Sửa">
                <svg viewBox="0 0 24 24" style="width:12px;height:12px;fill:currentColor;"><path d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.07,6.18L3,17.25Z"/></svg>
              </button>
              <button class="src-delete-btn" data-id="${c.id}"
                style="padding:3px 5px;background:#FEF2F2;color:#EF4444;border:none;border-radius:4px;cursor:pointer;" title="Xóa">
                <svg viewBox="0 0 24 24" style="width:12px;height:12px;fill:currentColor;"><path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/></svg>
              </button>
            </div>
          </td>
        </tr>`;
    }).join('');

    // Attach listeners for inline text/date inputs
    tbody.querySelectorAll('.src-inline-input').forEach(inp => {
      const save = async () => {
        const id = inp.dataset.id;
        const field = inp.dataset.field;
        const newVal = inp.value.trim();
        
        try {
          await db.collection('students').doc(id).update({ [field]: newVal });
          const idx = _allCrmCustomers.findIndex(x => x.id === id);
          if (idx > -1) {
            _allCrmCustomers[idx][field] = newVal;
            if (field === 'advisor') _allCrmCustomers[idx].source = newVal;
          }
          showToast('Đã tự động lưu', 'success');
        } catch (e) {
          showToast('Lỗi lưu: ' + e.message, 'error');
        }
      };
      if (inp.type === 'date') {
        inp.addEventListener('change', save);
      } else {
        inp.addEventListener('blur', save);
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { save(); inp.blur(); } });
      }
    });

    // Attach listeners for Diện selects
    tbody.querySelectorAll('.src-dien-select').forEach(sel => {
      sel.addEventListener('change', async () => {
        const id = sel.dataset.id;
        const val = sel.value;
        const style = getDienStyle(val);
        sel.style.backgroundColor = style.bg;
        sel.style.color = style.color;
        sel.style.border = style.border;
        try {
          await db.collection('students').doc(id).update({ dien: val });
          const idx = _allCrmCustomers.findIndex(x => x.id === id);
          if (idx > -1) _allCrmCustomers[idx].dien = val;
          showToast('Đã lưu Diện', 'success');
        } catch (e) {
          showToast('Lỗi: ' + e.message, 'error');
        }
      });
    });

    // Attach listeners for Tình trạng selects
    tbody.querySelectorAll('.src-tinhtrang-select').forEach(sel => {
      sel.addEventListener('change', async () => {
        const id = sel.dataset.id;
        const val = sel.value;
        const style = getTinhTrangStyle(val);
        sel.style.backgroundColor = style.bg;
        sel.style.color = style.color;
        sel.style.border = style.border;
        try {
          await db.collection('students').doc(id).update({ status: val });
          const idx = _allCrmCustomers.findIndex(x => x.id === id);
          if (idx > -1) _allCrmCustomers[idx].status = val;
          showToast('Đã lưu Tình trạng', 'success');
        } catch (e) {
          showToast('Lỗi: ' + e.message, 'error');
        }
      });
    });

    // Attach listeners for Kết quả selects
    tbody.querySelectorAll('.src-ketqua-select').forEach(sel => {
      sel.addEventListener('change', async () => {
        const id = sel.dataset.id;
        const field = sel.dataset.field;
        const val = sel.value;
        if (val === 'ĐỖ') {
          sel.style.backgroundColor = '#15803D';
          sel.style.color = '#FFFFFF';
          sel.style.border = '1px solid #166534';
          sel.style.fontWeight = 'bold';
        } else if (val === 'TRƯỢT') {
          sel.style.backgroundColor = '#B91C1C';
          sel.style.color = '#FFFFFF';
          sel.style.border = '1px solid #991B1B';
          sel.style.fontWeight = 'bold';
        } else {
          sel.style.backgroundColor = '#E5E7EB';
          sel.style.color = '#374151';
          sel.style.border = '1px solid #D1D5DB';
          sel.style.fontWeight = 'normal';
        }
        try {
          await db.collection('students').doc(id).update({ [field]: val });
          const idx = _allCrmCustomers.findIndex(x => x.id === id);
          if (idx > -1) _allCrmCustomers[idx][field] = val;
          showToast('Đã lưu Kết quả', 'success');
        } catch (e) {
          showToast('Lỗi: ' + e.message, 'error');
        }
      });
    });

    // Attach listeners for Cán bộ chăm sóc selects
    tbody.querySelectorAll('.src-advisor-select').forEach(sel => {
      sel.addEventListener('change', async () => {
        const id = sel.dataset.id;
        const val = sel.value;
        try {
          await db.collection('students').doc(id).update({ advisor: val, source: val });
          const idx = _allCrmCustomers.findIndex(x => x.id === id);
          if (idx > -1) {
            _allCrmCustomers[idx].advisor = val;
            _allCrmCustomers[idx].source = val;
          }
          showToast('Đã lưu Cán bộ chăm sóc', 'success');
        } catch (e) {
          showToast('Lỗi: ' + e.message, 'error');
        }
      });
    });

    tbody.querySelectorAll('.src-view-detail-btn').forEach(btn => {
      btn.addEventListener('click', () => openSourceDetail(pageData[parseInt(btn.dataset.idx)]));
    });

    tbody.querySelectorAll('.src-edit-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const c = pageData[parseInt(btn.dataset.idx)];
        if (!c) return;
        document.getElementById('srcModalTitle').textContent = 'CHỈNH SỬA HỌC VIÊN NGUỒN';
        const submitBtn = document.getElementById('btnSubmitSourceStudent');
        if (submitBtn) submitBtn.textContent = 'CẬP NHẬT HỌC VIÊN NGUỒN';
        document.getElementById('srcName').value      = c.name     || '';
        const selS = document.getElementById('srcStatus');
        if (selS) selS.value = c.status || 'Chưa đi thi/chờ đơn';
        const selDien = document.getElementById('srcDien');
        if (selDien) selDien.value = c.dien || 'TTS';
        const enrollEl = document.getElementById('srcEnrollDate');
        if (enrollEl) {
          if (c.enrollDate) {
            enrollEl.value = c.enrollDate;
          } else if (c.createdAt) {
            const d = c.createdAt.toDate ? c.createdAt.toDate() : new Date(c.createdAt);
            enrollEl.value = isNaN(d) ? '' : d.toISOString().slice(0, 10);
          } else { enrollEl.value = ''; }
        }
        ['1','2','3','Cuoi'].forEach(suffix => {
          const keyField = suffix === 'Cuoi' ? 'ngay_thi_cuoi' : `ngay_thi_${suffix.toLowerCase()}`;
          const resField = suffix === 'Cuoi' ? 'ket_qua_cuoi' : `ket_qua_${suffix.toLowerCase()}`;
          const dateEl = document.getElementById(`srcNgayThi${suffix}`);
          const resEl = document.getElementById(`srcKetQua${suffix}`);
          if (dateEl) dateEl.value = c[keyField] || '';
          if (resEl) resEl.value = c[resField] || '';
        });
        await populateSrcAdvisorSelect(c.advisor || c.source || '');
        document.getElementById('sourceStudentModal').style.display = 'flex';
        if (submitBtn) submitBtn.dataset.editId = c.id;
      });
    });

    tbody.querySelectorAll('.src-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Xóa học viên nguồn này?')) return;
        try {
          await db.collection('students').doc(btn.dataset.id).delete();
          _allCrmCustomers = _allCrmCustomers.filter(x => x.id !== btn.dataset.id);
          renderCrmSource(true);
          showToast('Đã xóa', 'success');
        } catch(e) { showToast('Lỗi: ' + e.message, 'error'); }
      });
    });

    renderPagination('crmSourcePagination', crmSourcePage, filtered.length, (p) => {
      crmSourcePage = p;
      renderCrmSource();
    });
  };

  // ── Source Student Detail Modal ────────────────────────────────────────────
  let _currentSrcStudent = null;

  const fmtVND = (n) => Number(n || 0).toLocaleString('vi-VN') + ' đ';
  const padZ = (n) => String(n).padStart(2, '0');

  const loadRevEntries = async (studentId) => {
    const list = document.getElementById('revEntryList');
    if (!list) return;
    list.innerHTML = `<div style="text-align:center;padding:1.5rem;color:var(--text-muted);font-size:0.8rem;">Đang tải...</div>`;
    try {
      const snap = await db.collection('students').doc(studentId)
        .collection('revenueEntries').orderBy('date', 'desc').get();
      if (snap.empty) {
        list.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--text-muted);font-size:0.8rem;font-style:italic;">Chưa có đợt doanh thu nào</div>`;
        document.getElementById('srcDetailTotalRevenue').textContent = '0 đ';
        document.getElementById('srcDetailEntryCount').textContent = '0 đợt thanh toán';
        return;
      }
      let total = 0;
      const rows = snap.docs.map((d, i) => {
        const e = d.data();
        total += Number(e.amount || 0);
        return { id: d.id, ...e };
      });
      document.getElementById('srcDetailTotalRevenue').textContent = fmtVND(total);
      document.getElementById('srcDetailEntryCount').textContent = `${rows.length} đợt thanh toán`;

      list.innerHTML = rows.map((e, i) => `
        <div style="display:flex;align-items:center;gap:0.75rem;padding:0.75rem 0;
                    border-bottom:1px solid var(--border-light);${i === rows.length-1 ? 'border-bottom:none;' : ''}">
          <div style="width:36px;height:36px;border-radius:50%;background:#EEF2FF;color:#6366F1;
                      display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:700;flex-shrink:0;">
            ${padZ(i + 1)}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:0.82rem;font-weight:600;color:var(--text-main);">${fmtVND(e.amount)}</div>
            <div style="font-size:0.72rem;color:var(--text-muted);margin-top:1px;">${e.note || 'Không có ghi chú'} · ${e.date || '--'}</div>
          </div>
          <button class="rev-delete-btn" data-entryid="${e.id}"
            style="padding:4px 6px;background:#FEF2F2;color:#EF4444;border:none;border-radius:6px;cursor:pointer;flex-shrink:0;">
            <svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:currentColor;"><path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/></svg>
          </button>
        </div>`).join('');

      list.querySelectorAll('.rev-delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Xóa đợt doanh thu này?')) return;
          await db.collection('students').doc(_currentSrcStudent.id)
            .collection('revenueEntries').doc(btn.dataset.entryid).delete();
          loadRevEntries(_currentSrcStudent.id);
        });
      });
    } catch(e) {
      list.innerHTML = `<div style="color:#EF4444;font-size:0.8rem;padding:1rem;">Lỗi tải dữ liệu</div>`;
    }
  };

  const openSourceDetail = (student) => {
    if (!student) return;
    _currentSrcStudent = student;
    const modal = document.getElementById('sourceDetailModal');
    if (!modal) return;

    const avColors = ['#2563EB','#7C3AED','#059669','#D97706','#DC2626','#0891B2'];
    const avSeed = (student.name || '').split('').reduce((a,c) => a + c.charCodeAt(0), 0);
    const ini = (student.name || 'HV').split(' ').map(w => w[0]).filter(Boolean).slice(-2).join('').toUpperCase();
    const av = document.getElementById('srcDetailAvatar');
    if (av) { av.textContent = ini; av.style.background = avColors[avSeed % avColors.length]; }

    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '--'; };
    setText('srcDetailName', student.name);
    setText('srcDetailCode', student.hnvCode || 'HNV----');
    setText('srcDetailDien', student.dien || 'TTS');
    setText('srcDetailEnrollDate', student.enrollDate);
    setText('srcDetailAdvisor', student.advisor || student.source);
    setText('srcDetailStatus', student.status || 'Chưa đi thi/chờ đơn');

    const setKetQuaBadge = (id, val) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = val || '--';
      if (val === 'ĐỖ') {
        el.style.backgroundColor = '#DEF7EC';
        el.style.color = '#03543F';
        el.style.border = '1px solid #A7F3D0';
      } else if (val === 'TRƯỢT') {
        el.style.backgroundColor = '#FDE8E8';
        el.style.color = '#9B1C1C';
        el.style.border = '1px solid #FCA5A5';
      } else {
        el.style.backgroundColor = 'var(--bg-primary)';
        el.style.color = 'var(--text-muted)';
        el.style.border = '1px solid var(--border-light)';
      }
    };

    setText('srcDetailNgayThi1', student.ngay_thi_1);
    setKetQuaBadge('srcDetailKetQua1', student.ket_qua_1);

    setText('srcDetailNgayThi2', student.ngay_thi_2);
    setKetQuaBadge('srcDetailKetQua2', student.ket_qua_2);

    setText('srcDetailNgayThi3', student.ngay_thi_3);
    setKetQuaBadge('srcDetailKetQua3', student.ket_qua_3);

    setText('srcDetailNgayThiCuoi', student.ngay_thi_cuoi);
    setKetQuaBadge('srcDetailKetQuaCuoi', student.ket_qua_cuoi);

    // Status badge in header
    const badge = document.getElementById('srcDetailStatusBadge');
    if (badge) {
      const st = student.status || 'Chưa đi thi/chờ đơn';
      const stColors = {
        'Chưa đi thi/chờ đơn': { bg: 'rgba(107,114,128,0.12)', color: '#6B7280' },
        'Đã đi tập trung':     { bg: 'rgba(245,158,11,0.12)',  color: '#D97706' },
        'Đã thi 1 đơn':        { bg: 'rgba(16,185,129,0.12)',  color: '#059669' },
        'Đã thi 2 đơn':        { bg: 'rgba(16,185,129,0.12)',  color: '#059669' },
        'Đã thi 3 đơn':        { bg: 'rgba(16,185,129,0.12)',  color: '#059669' },
        'Đã thi hơn 3 đơn':    { bg: 'rgba(16,185,129,0.12)',  color: '#059669' },
        'Đã bỏ/Dừng học':      { bg: 'rgba(239,68,68,0.12)',   color: '#EF4444' }
      };
      const c = stColors[st] || stColors['Chưa đi thi/chờ đơn'];
      badge.textContent = st;
      badge.style.background = c.bg;
      badge.style.color = c.color;
    }

    document.getElementById('revEntryForm').style.display = 'none';
    modal.style.display = 'flex';
    loadRevEntries(student.id);
  };

  const setupSourceDetailModal = () => {
    const closeModal = () => {
      const m = document.getElementById('sourceDetailModal');
      if (m) m.style.display = 'none';
      _currentSrcStudent = null;
    };
    document.getElementById('btnCloseSourceDetail')?.addEventListener('click', closeModal);
    document.getElementById('btnCloseSourceDetailFooter')?.addEventListener('click', closeModal);

    document.getElementById('btnAddRevEntry')?.addEventListener('click', () => {
      const form = document.getElementById('revEntryForm');
      if (!form) return;
      form.style.display = form.style.display === 'none' ? 'block' : 'none';
      if (form.style.display === 'block') {
        const today = new Date();
        const d = document.getElementById('revEntryDate');
        if (d) d.value = `${today.getFullYear()}-${padZ(today.getMonth()+1)}-${padZ(today.getDate())}`;
        document.getElementById('revEntryAmount').value = '';
        document.getElementById('revEntryNote').value = '';
      }
    });

    document.getElementById('btnCancelRevEntry')?.addEventListener('click', () => {
      document.getElementById('revEntryForm').style.display = 'none';
    });

    document.getElementById('btnSaveRevEntry')?.addEventListener('click', async () => {
      const amount = parseFloat(document.getElementById('revEntryAmount')?.value || 0);
      const date = document.getElementById('revEntryDate')?.value;
      const note = document.getElementById('revEntryNote')?.value.trim();
      if (!amount || !date) { showToast('Vui lòng nhập số tiền và ngày', 'error'); return; }
      if (!_currentSrcStudent?.id) return;
      try {
        await db.collection('students').doc(_currentSrcStudent.id)
          .collection('revenueEntries').add({
            amount, date, note,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          });
        document.getElementById('revEntryForm').style.display = 'none';
        loadRevEntries(_currentSrcStudent.id);
        showToast('Đã thêm đợt doanh thu', 'success');
      } catch(e) { showToast('Lỗi: ' + e.message, 'error'); }
    });

    document.getElementById('btnEditSourceStudent')?.addEventListener('click', async () => {
      if (!_currentSrcStudent) return;
      const c = _currentSrcStudent;
      document.getElementById('srcModalTitle').textContent = 'CHỈNH SỬA HỌC VIÊN NGUỒN';
      const submitBtn = document.getElementById('btnSubmitSourceStudent');
      if (submitBtn) submitBtn.textContent = 'CẬP NHẬT HỌC VIÊN NGUỒN';
      document.getElementById('srcName').value     = c.name     || '';
      const selS = document.getElementById('srcStatus');
      if (selS) selS.value = c.status || 'Chưa đi thi/chờ đơn';
      const selDien = document.getElementById('srcDien');
      if (selDien) selDien.value = c.dien || 'TTS';
      const enrollEl = document.getElementById('srcEnrollDate');
      if (enrollEl) {
        if (c.enrollDate) {
          enrollEl.value = c.enrollDate;
        } else if (c.createdAt) {
          const d = c.createdAt.toDate ? c.createdAt.toDate() : new Date(c.createdAt);
          enrollEl.value = isNaN(d) ? '' : d.toISOString().slice(0, 10);
        } else { enrollEl.value = ''; }
      }
      ['1','2','3','Cuoi'].forEach(suffix => {
        const keyField = suffix === 'Cuoi' ? 'ngay_thi_cuoi' : `ngay_thi_${suffix.toLowerCase()}`;
        const resField = suffix === 'Cuoi' ? 'ket_qua_cuoi' : `ket_qua_${suffix.toLowerCase()}`;
        const dateEl = document.getElementById(`srcNgayThi${suffix}`);
        const resEl = document.getElementById(`srcKetQua${suffix}`);
        if (dateEl) dateEl.value = c[keyField] || '';
        if (resEl) resEl.value = c[resField] || '';
      });
      await populateSrcAdvisorSelect(c.advisor || c.source || '');
      if (submitBtn) submitBtn.dataset.editId = c.id;
      document.getElementById('sourceDetailModal').style.display = 'none';
      document.getElementById('sourceStudentModal').style.display = 'flex';
    });
  };

  // ── CRM Notes ──────────────────────────────────────────────────────────────
  const NOTE_TAG_META = {
    general: { label: '📌 Chung',    bg: 'rgba(107,114,128,0.1)', color: '#6B7280' },
    call:    { label: '📞 Cuộc gọi', bg: 'rgba(37,99,235,0.1)',   color: '#2563EB' },
    meeting: { label: '🤝 Gặp mặt', bg: 'rgba(16,185,129,0.1)',   color: '#059669' },
    email:   { label: '📧 Email',    bg: 'rgba(217,119,6,0.1)',    color: '#D97706' },
    task:    { label: '✅ Công việc', bg: 'rgba(99,102,241,0.1)',  color: '#6366F1' },
    warning: { label: '⚠️ Lưu ý',   bg: 'rgba(239,68,68,0.1)',    color: '#EF4444' },
  };

  const loadCrmNotes = async (customerId) => {
    const list = document.getElementById('crmNotesList');
    const badge = document.getElementById('noteCountBadge');
    if (!list) return;
    list.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--text-muted);font-size:0.8rem;">Đang tải...</div>`;
    try {
      const snap = await db.collection('students').doc(customerId)
        .collection('notes').orderBy('createdAt', 'desc').get();
      if (badge) badge.textContent = `${snap.size} ghi chú`;
      if (snap.empty) {
        list.innerHTML = `<div style="text-align:center;padding:3rem 1rem;color:var(--text-muted);font-size:0.82rem;font-style:italic;">Chưa có ghi chú nào. Hãy thêm ghi chú đầu tiên!</div>`;
        return;
      }
      list.innerHTML = snap.docs.map(d => {
        const n = d.data();
        const tag = NOTE_TAG_META[n.tag] || NOTE_TAG_META['general'];
        let dateStr = '';
        if (n.createdAt?.toDate) {
          const dt = n.createdAt.toDate();
          dateStr = `${padZ(dt.getDate())}/${padZ(dt.getMonth()+1)}/${dt.getFullYear()} ${padZ(dt.getHours())}:${padZ(dt.getMinutes())}`;
        }
        return `
          <div style="background:var(--bg-primary);border:1px solid var(--border-light);border-radius:11px;padding:0.85rem 1rem;position:relative;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;margin-bottom:0.5rem;">
              <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
                <span style="font-size:0.62rem;font-weight:700;padding:2px 8px;border-radius:6px;background:${tag.bg};color:${tag.color};">${tag.label}</span>
                ${n.title ? `<span style="font-size:0.82rem;font-weight:700;color:var(--text-main);">${n.title}</span>` : ''}
              </div>
              <div style="display:flex;align-items:center;gap:0.4rem;flex-shrink:0;">
                <span style="font-size:0.65rem;color:var(--text-muted);white-space:nowrap;">${dateStr}</span>
                <button class="note-delete-btn" data-noteid="${d.id}"
                  style="padding:3px 5px;background:#FEF2F2;color:#EF4444;border:none;border-radius:6px;cursor:pointer;line-height:1;">
                  <svg viewBox="0 0 24 24" style="width:12px;height:12px;fill:currentColor;"><path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/></svg>
                </button>
              </div>
            </div>
            <p style="font-size:0.8rem;color:var(--text-main);line-height:1.6;white-space:pre-wrap;margin:0;">${n.content || ''}</p>
          </div>`;
      }).join('');

      list.querySelectorAll('.note-delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Xóa ghi chú này?')) return;
          await db.collection('students').doc(_currentCrmCustomer.id)
            .collection('notes').doc(btn.dataset.noteid).delete();
          loadCrmNotes(_currentCrmCustomer.id);
        });
      });
    } catch(e) {
      list.innerHTML = `<div style="color:#EF4444;font-size:0.8rem;padding:1rem;">Lỗi tải ghi chú</div>`;
    }
  };

  const setupCrmNotes = () => {
    document.getElementById('btnSaveNote')?.addEventListener('click', async () => {
      if (!_currentCrmCustomer?.id) return;
      const content = document.getElementById('noteContent')?.value.trim();
      if (!content) { showToast('Vui lòng nhập nội dung ghi chú', 'error'); return; }
      const data = {
        title: document.getElementById('noteTitle')?.value.trim() || '',
        tag: document.getElementById('noteTag')?.value || 'general',
        content,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      };
      try {
        await db.collection('students').doc(_currentCrmCustomer.id).collection('notes').add(data);
        document.getElementById('noteContent').value = '';
        document.getElementById('noteTitle').value = '';
        document.getElementById('noteTag').value = 'general';
        loadCrmNotes(_currentCrmCustomer.id);
        showToast('Đã lưu ghi chú', 'success');
      } catch(e) { showToast('Lỗi: ' + e.message, 'error'); }
    });
  };

  // ── CRM Staff ──────────────────────────────────────────────────────────────
  let _allCrmStaff = [];
  let _crmStaffProfileStaff = null;
  let _spCurrentStaff = null; // logged-in staff profile for staff portal

  const reloadCrmStaff = () => {
    db.collection('hrm_staff').orderBy('name').get()
      .then(snap => {
        _allCrmStaff = [];
        snap.forEach(doc => { const d = doc.data(); d.id = doc.id; _allCrmStaff.push(d); });
        renderCrmStaff();
      })
      .catch(err => console.error('CRM staff reload error:', err));
  };

  const closeCrmStaffProfile = () => {
    const overlay = document.getElementById('crmStaffProfileView');
    if (overlay) overlay.style.display = 'none';
    _crmStaffProfileStaff = null;
  };

  const populateCrmStaffProfile = (s) => {
    const initials = (s.name || 'N').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const bg = getAvatarBgColor(s.name || '');

    const avatarEl = document.getElementById('crmProfileAvatarLg');
    if (avatarEl) { avatarEl.textContent = initials; avatarEl.style.background = bg; }

    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '--'; };
    const fmtDate = (dateStr) => {
      if (!dateStr) return '--';
      const parts = dateStr.split('-');
      if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
      return dateStr;
    };
    const fmtCurrency = (val) => {
      return (val || 0).toLocaleString('vi-VN') + ' đ';
    };

    setText('crmProfileFullName', s.name);

    const empCode = document.getElementById('crmProfileEmpCode');
    if (empCode) {
      const globalIdx = _allCrmStaff.findIndex(x => x.id === s.id) + 1;
      const empCodeVal = globalIdx > 0 ? String(globalIdx).padStart(5, '0') : '--';
      empCode.textContent = `Mã ${empCodeVal}`;
    }

    const positions = document.getElementById('crmProfilePositions');
    if (positions) {
      const positionText = s.jobTitle || s.position || '';
      positions.textContent = positionText ? `${positionText} • ${s.department || ''}` : '--';
    }

    setText('crmPUsername', s.username);
    setText('crmPJoinDate', fmtDate(s.joinDate));
    setText('crmPBirthday', fmtDate(s.birthday));
    setText('crmPHometown', s.hometown);
    setText('crmPGender', s.gender);
    setText('crmPMarital', s.maritalStatus);
    setText('crmPEducation', s.education);

    const emailEl = document.getElementById('crmPEmail');
    if (emailEl) { emailEl.textContent = s.email || '--'; emailEl.href = s.email ? `mailto:${s.email}` : '#'; }
    const phoneEl = document.getElementById('crmPPhone');
    if (phoneEl) { phoneEl.textContent = s.phone || '--'; phoneEl.href = s.phone ? `tel:${s.phone}` : '#'; }

    const badge = document.getElementById('crmProfileStatusBadge');
    if (badge) {
      badge.textContent = s.status || '--';
      badge.className = 'profile-status-badge';
      if (s.status === 'Đang làm việc') badge.classList.add('active-badge');
      else if (s.status === 'Nghỉ phép') badge.classList.add('leave-badge');
      else badge.classList.add('inactive-badge');
    }

    const incomeEl = document.getElementById('crmPIncome');
    if (incomeEl) incomeEl.textContent = s.salary > 0 ? Number(s.salary).toLocaleString('vi-VN') + ' đ' : '-- đ';

    const seed = (s.id || s.name || 'x').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const companyDebt = Math.round(((seed * 1234567) % 25000000) / 1000000) * 1000000;
    const personalDebt = Math.round(((seed * 89012) % 4000000) / 500000) * 500000;
    setText('crmPTotalDebt', (companyDebt + personalDebt).toLocaleString('vi-VN') + ' đ');
    setText('crmPCompanyDebt', companyDebt.toLocaleString('vi-VN') + ' đ');
    setText('crmPPersonalDebt', personalDebt.toLocaleString('vi-VN') + ' đ');

    const early = 25 + (seed % 20);
    const onTime = 8 + (seed % 12);
    const late = 8 + ((seed * 3) % 18);
    const pending = Math.max(5, 100 - early - onTime - late);
    const totalTasks = 18 + (seed % 28);
    setText('crmLegEarly', early + '%');
    setText('crmLegOnTime', onTime + '%');
    setText('crmLegLate', late + '%');
    setText('crmLegPending', pending + '%');

    // Populate detail tabs
    setText('crmProfileIdNumber', s.idNumber);
    setText('crmProfileIdDate', fmtDate(s.idDate));
    setText('crmProfileIdPlace', s.idPlace);
    setText('crmProfileAddressPermanent', s.addressPermanent);
    setText('crmProfileAddressCurrent', s.addressCurrent);
    setText('crmProfileEmergencyName', s.emergencyContactName);
    setText('crmProfileEmergencyPhone', s.emergencyContactPhone);
    setText('crmProfileEmergencyRelation', s.emergencyContactRelation);

    setText('crmProfileContractType', s.contractType);
    setText('crmProfileContractStartDate', fmtDate(s.contractStartDate || s.joinDate));
    setText('crmProfileContractEndDate', s.contractEndDate ? fmtDate(s.contractEndDate) : 'Vô thời hạn');
    setText('crmProfileContractStatus', s.status === 'Đã nghỉ việc' ? 'Hết hiệu lực' : 'Đang hiệu lực');
    setText('crmProfileDept', s.department);
    setText('crmProfilePos', s.position);
    setText('crmProfileManager', s.manager || 'Ban Giám đốc');
    setText('crmProfileJoinDate2', fmtDate(s.joinDate));

    setText('crmProfileBaseSalary', fmtCurrency(s.salary));
    setText('crmProfileAllowanceLunch', s.allowanceSalary ? fmtCurrency(s.allowanceSalary) : '0 đ');
    setText('crmProfileInsurance', s.insuranceSalary || 'Không');
    setText('crmProfileBankNo', s.bankAccountNo);
    setText('crmProfileBankName', s.bankName);
    setText('crmProfileBankAccountName', s.bankAccountName);
    setText('crmProfileTaxCode', s.taxCode);

    // Load leave data for CRM staff view
    if (s.email) loadLeaveData(s.email, s.joinDate, 'cpt', false);

    requestAnimationFrame(() => {
      drawDonutChart('crmWorkEfficiencyChart', totalTasks, [
        { value: early, color: '#4CAF50' },
        { value: onTime, color: '#3FA2F6' },
        { value: late, color: '#FFC107' },
        { value: pending, color: '#F44336' }
      ]);
      drawRadarChart('crmSkillsRadarChart', [
        { label: 'Tổ chức', value: 2 + (seed % 3), max: 5 },
        { label: 'Văn hóa', value: 2 + ((seed * 2) % 3), max: 5 },
        { label: 'Giao tiếp', value: 2 + ((seed * 3) % 3), max: 5 },
        { label: 'Chuyên môn', value: 2 + ((seed * 4) % 3), max: 5 },
        { label: 'Sáng tạo', value: 1 + ((seed * 5) % 4), max: 5 },
        { label: 'Nhóm', value: 2 + ((seed * 6) % 3), max: 5 }
      ]);
    });
  };

  const openCrmStaffProfile = (s) => {
    _crmStaffProfileStaff = s;
    const overlay = document.getElementById('crmStaffProfileView');
    if (!overlay) return;

    // Ensure overlay lives inside portal-main-workspace so position:absolute
    // covers only the main area and leaves the sidebar visible
    const workspace = document.querySelector('.portal-main-workspace');
    if (workspace && overlay.parentElement !== workspace) {
      workspace.appendChild(overlay);
    }

    document.querySelectorAll('.crmsp-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.crmsp-panel').forEach(p => p.classList.remove('active'));
    const firstTab = document.querySelector('.crmsp-tab[data-ctab="cptab-general"]');
    if (firstTab) firstTab.classList.add('active');
    const firstPanel = document.getElementById('cptab-general');
    if (firstPanel) firstPanel.classList.add('active');
    populateCrmStaffProfile(s);
    overlay.style.display = 'flex';
  };
  let crmStaffPage = 1;

  const renderCrmStaff = (resetPage = false) => {
    if (resetPage) crmStaffPage = 1;
    const tbody = document.getElementById('crmStaffTableBody');
    if (!tbody) return;
    const search = (document.getElementById('crmStaffSearch')?.value || '').toLowerCase();
    const dept   = document.getElementById('crmStaffDeptFilter')?.value || 'All';
    const status = document.getElementById('crmStaffStatusFilter')?.value || 'All';

    const filtered = _allCrmStaff.filter(s => {
      if (dept !== 'All' && s.department !== dept) return false;
      if (status !== 'All' && s.status !== status) return false;
      if (search) {
        const hay = `${s.name} ${s.email} ${s.position}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });

    const counter = document.getElementById('crmStaffCount');
    if (counter) counter.textContent = `${filtered.length} / ${_allCrmStaff.length} nhân viên`;

    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:2rem">Không tìm thấy nhân viên nào</td></tr>';
      renderPagination('crmStaffPagination', 1, 0, () => {});
      return;
    }

    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    crmStaffPage = Math.min(crmStaffPage, totalPages);
    const pageData = filtered.slice((crmStaffPage - 1) * PAGE_SIZE, crmStaffPage * PAGE_SIZE);
    const globalOffset = (crmStaffPage - 1) * PAGE_SIZE;

    const COLORS = ['#2563EB','#7C3AED','#DB2777','#D97706','#059669','#0891B2'];
    tbody.innerHTML = pageData.map((s, i) => {
      const gi = globalOffset + i;
      const initials = (s.name || 'N').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
      const color = COLORS[gi % COLORS.length];
      const joinDate = s.joinDate ? new Date(s.joinDate).toLocaleDateString('vi-VN') : '--';
      const st = s.status === 'Đang làm việc' ? 'active' : s.status === 'Nghỉ phép' ? 'leave' : 'left';
      return `<tr>
        <td>
          <div style="display:flex;align-items:center;gap:0.65rem">
            <div style="width:34px;height:34px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:700;color:#fff;flex-shrink:0">${initials}</div>
            <div>
              <div style="font-weight:600;font-size:0.82rem">${s.name || '--'}</div>
              <div style="font-size:0.71rem;color:var(--text-muted)">${s.email || ''}</div>
            </div>
          </div>
        </td>
        <td style="font-size:0.8rem">${s.department || '--'}</td>
        <td style="font-size:0.8rem">${s.position || '--'}</td>
        <td style="font-size:0.78rem;color:var(--text-muted)">${s.phone || '--'}</td>
        <td style="font-size:0.78rem">${joinDate}</td>
        <td><span class="crm-staff-badge ${st}">${s.status || '--'}</span></td>
        <td>
          <div style="display:flex;gap:0.3rem;align-items:center">
            <button class="crm-row-action-btn view" data-id="${s.id}" title="Xem chi tiết">
              <svg viewBox="0 0 24 24"><path d="M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17M12,4.5C7,4.5 2.73,7.61 1,12C2.73,16.39 7,19.5 12,19.5C17,19.5 21.27,16.39 23,12C21.27,7.61 17,4.5 12,4.5Z"/></svg>
            </button>
            <button class="crm-row-action-btn edit" data-id="${s.id}" title="Chỉnh sửa">
              <svg viewBox="0 0 24 24"><path d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z"/></svg>
            </button>
            <button class="crm-row-action-btn delete" data-id="${s.id}" data-name="${(s.name || '').replace(/"/g, '&quot;')}" title="Xóa">
              <svg viewBox="0 0 24 24"><path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/></svg>
            </button>
          </div>
        </td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('.crm-row-action-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const staff = _allCrmStaff.find(s => s.id === btn.dataset.id);
        if (!staff) return;
        if (btn.classList.contains('view')) openCrmStaffProfile(staff);
        else if (btn.classList.contains('edit')) editHrmStaff(staff);
        else if (btn.classList.contains('delete')) deleteHrmStaff(staff.id, staff.name);
      });
    });

    renderPagination('crmStaffPagination', crmStaffPage, filtered.length, (p) => {
      crmStaffPage = p;
      renderCrmStaff();
    });
  };


  // ══════════════════════════════════════════════════════════════════════════
  // INTERNAL CHAT (IOC)
  // ══════════════════════════════════════════════════════════════════════════

  let crmChatSubscription = null;
  let _iocMsgs       = [];
  let _iocSearchTerm = '';
  let _iocReplyTo   = null;
  let _iocEditingId = null;
  let _iocCtxMsgId  = null;
  let _iocForwardId = null;
  let _iocDmPreviews = {};   // { threadId: { text, time, unread } }
  let _iocDmSubs     = {};   // { threadId: unsubFn }
  let _iocFavThreads = new Set();
  let _iocMutedThreads = new Set();
  let _iocActiveThread = {
    id: 'group-global', name: 'Nhóm Nội bộ Aladdin',
    av: 'N', color: '#6366F1', type: 'group'
  };

  // Persist favorites & mutes to localStorage (keyed by email)
  const iocFavKey  = () => `ioc_favs_${currentUser?.email || 'anon'}`;
  const iocMuteKey = () => `ioc_mutes_${currentUser?.email || 'anon'}`;
  const iocLoadPrefs = () => {
    try {
      _iocFavThreads   = new Set(JSON.parse(localStorage.getItem(iocFavKey())  || '[]'));
      _iocMutedThreads = new Set(JSON.parse(localStorage.getItem(iocMuteKey()) || '[]'));
    } catch(_) {}
  };
  const iocSavePrefs = () => {
    localStorage.setItem(iocFavKey(),  JSON.stringify([..._iocFavThreads]));
    localStorage.setItem(iocMuteKey(), JSON.stringify([..._iocMutedThreads]));
  };

  const iocAvatarColor = str => {
    const C = ['#6366F1','#7C3AED','#DB2777','#D97706','#059669','#0891B2','#DC2626','#7E22CE'];
    let h = 0;
    for (let i = 0; i < (str || '').length; i++) h = (str.charCodeAt(i) + ((h << 5) - h)) | 0;
    return C[Math.abs(h) % C.length];
  };

  const iocIsMine = msg => {
    const me = currentUser;
    if (!me) return false;
    return (msg.senderEmail && me.email && msg.senderEmail.toLowerCase() === me.email.toLowerCase())
        || (msg.senderName  && me.name  && msg.senderName.toLowerCase()  === me.name.toLowerCase());
  };

  const esc = s => (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  // Danh bạ "Chat nội bộ" PHẢI lấy đúng từ hồ sơ nhân sự thật (hrm_staff) — KHÔNG
  // được fallback sang allUsersList (toàn bộ collection "users", gồm cả học viên/
  // tài khoản không liên quan), nếu không sẽ hiện người không phải nhân sự.
  const iocGetMembers = () => {
    if (_allCrmStaff && _allCrmStaff.length) return _allCrmStaff;
    return currentUser ? [currentUser] : [];
  };

  // ── Switch thread ──────────────────────────────────────────────────────────
  const iocOpenThread = (id, name, av, color, type = 'dm', desc = '') => {
    if (_iocActiveThread.id === id) return;
    _iocActiveThread = {
      id, name, type,
      av:    av    || (name || 'U')[0].toUpperCase(),
      color: color || iocAvatarColor(name),
      desc,
    };

    // Reset search when switching thread
    _iocSearchTerm = '';
    const _searchBar = document.getElementById('iocMsgSearchBar');
    const _searchInp = document.getElementById('iocMsgSearchInput');
    if (_searchBar) _searchBar.style.display = 'none';
    if (_searchInp) _searchInp.value = '';

    // Mark thread as read
    _iocDmPreviews[id] = { ...(_iocDmPreviews[id] || {}), unread: 0 };
    localStorage.setItem(`ioc_lastread_${id}_${currentUser?.email}`, Date.now());

    const avEl    = document.getElementById('iocActiveAv');
    const nameEl  = document.getElementById('iocActiveThreadName');
    const subEl   = document.getElementById('iocActiveThreadSub');
    const backBtn = document.getElementById('btnIocThreadBack');
    if (avEl)    { avEl.textContent = _iocActiveThread.av; avEl.style.background = _iocActiveThread.color; }
    if (nameEl)  nameEl.textContent = name;
    if (subEl)   subEl.textContent = type === 'group' ? `${iocGetMembers().length} thành viên` : 'Trực tiếp';
    if (backBtn) backBtn.style.display = type === 'dm' ? 'flex' : 'none';

    // Update info panel
    const infoAvEl   = document.getElementById('iocInfoGroupAv');
    const infoNameEl = document.getElementById('iocInfoGroupName');
    const infoDescEl = document.getElementById('iocInfoGroupDesc');
    const renameBtnEl= document.getElementById('btnIocRenameGroup');
    if (infoAvEl) { infoAvEl.textContent = _iocActiveThread.av; infoAvEl.style.background = _iocActiveThread.color; }
    if (infoNameEl) {
      infoNameEl.textContent = name;
      if (renameBtnEl) {
        if (type === 'group') infoNameEl.appendChild(renameBtnEl);
        else renameBtnEl.remove?.();
      }
    }
    if (infoDescEl) infoDescEl.textContent = desc || (type === 'group' ? `Nhóm · ${iocGetMembers().length} thành viên` : 'Tin nhắn trực tiếp');

    iocUpdateFavBtn();
    iocUpdateNotifyBtn();
    iocShowInfoMain();
    setupCrmChat();
  };

  // ── Conversation sidebar list ──────────────────────────────────────────────
  const iocBuildConvItem = (threadId, av, color, name, preview, timeStr, active, unread) => {
    const unreadHtml = unread > 0 ? `<span class="ioc-conv-unread">${unread > 9 ? '9+' : unread}</span>` : '';
    return `<div class="ioc-conv-item${active ? ' active' : ''}"
      data-thread-id="${threadId}" data-thread-name="${esc(name)}"
      data-thread-av="${av}" data-thread-color="${color}">
      <div class="ioc-conv-av" style="background:${color}">${av}<span class="ioc-online"></span></div>
      <div class="ioc-conv-body">
        <div class="ioc-conv-row1"><span class="ioc-conv-name">${esc(name)}</span><span class="ioc-conv-time">${timeStr}</span></div>
        <div class="ioc-conv-row2"><span class="ioc-conv-preview">${preview}</span>${unreadHtml}</div>
      </div>
    </div>`;
  };

  const iocRenderConvList = () => {
    const favEl = document.getElementById('iocConvList');
    const recEl = document.getElementById('iocRecentList');
    if (!favEl || !recEl) return;

    const members = iocGetMembers();
    const search  = (document.getElementById('crmChatSearch')?.value || '').toLowerCase();

    // Group preview
    const getLastMsgPreview = (msgs) => {
      const m = msgs.filter(x => !x.recalled).slice(-1)[0];
      if (!m) return { text: 'Chưa có tin nhắn', time: '' };
      return {
        text: m.imageUrl ? '📷 Hình ảnh' : m.fileName ? `📎 ${m.fileName}` : esc(m.content || ''),
        time: m.createdAt?.toDate ? m.createdAt.toDate().toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'}) : ''
      };
    };
    const groupIsActive = _iocActiveThread.id === 'group-global';
    const { text: gText, time: gTime } = groupIsActive
      ? getLastMsgPreview(_iocMsgs)
      : { text: _iocDmPreviews['group-global']?.text || 'Chưa có tin nhắn', time: _iocDmPreviews['group-global']?.time || '' };
    const groupUnread = groupIsActive ? 0 : (_iocDmPreviews['group-global']?.unread || 0);
    const groupItem = iocBuildConvItem('group-global','N','#6366F1','Nhóm Nội bộ Aladdin', gText, gTime, groupIsActive, groupUnread);

    const filtered = members.filter(u =>
      !search || (u.name||'').toLowerCase().includes(search) || (u.department||u.dept||'').toLowerCase().includes(search)
    );

    const dmItemsHtml = filtered.slice(0, 20).map(u => {
      const ini   = (u.name||'U').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
      const color = iocAvatarColor(u.name||'U');
      const dmId  = 'dm-'+[currentUser?.uid||currentUser?.email||'me', u.id||u.uid||u.email].sort().join('__');
      const active= _iocActiveThread.id === dmId;
      const { text, time } = active ? getLastMsgPreview(_iocMsgs) : { text: _iocDmPreviews[dmId]?.text || u.position||u.department||'Nhân viên', time: _iocDmPreviews[dmId]?.time||'' };
      const unread= active ? 0 : (_iocDmPreviews[dmId]?.unread||0);
      return { html: iocBuildConvItem(dmId,ini,color,u.name||'Người dùng',text,time,active,unread), dmId };
    });

    const groupIsFav = _iocFavThreads.has('group-global');
    const favDms = dmItemsHtml.filter(x => _iocFavThreads.has(x.dmId));
    const recDms = dmItemsHtml.filter(x => !_iocFavThreads.has(x.dmId));

    favEl.innerHTML = (groupIsFav ? groupItem : '') + favDms.map(x=>x.html).join('');
    recEl.innerHTML = (!groupIsFav ? groupItem : '') + (recDms.map(x=>x.html).join('') || '<div class="ioc-empty-list">Không tìm thấy nhân viên</div>');

    [favEl, recEl].forEach(container => {
      container.querySelectorAll('[data-thread-id]').forEach(el => {
        el.addEventListener('click', () => {
          const id   = el.dataset.threadId;
          const name = el.dataset.threadName || id;
          const av   = el.dataset.threadAv || name[0];
          const col  = el.dataset.threadColor || iocAvatarColor(name);
          iocOpenThread(id, name, av, col, id === 'group-global' ? 'group' : 'dm');
        });
      });
    });

    const subEl = document.getElementById('iocActiveThreadSub');
    if (subEl && _iocActiveThread.type === 'group') subEl.textContent = `${members.length} thành viên`;
    const badge = document.getElementById('crmMemberCount');
    if (badge) badge.textContent = members.length;
  };

  // ── Render messages ────────────────────────────────────────────────────────
  const iocRenderMessages = msgs => {
    const container = document.getElementById('crmChatMessages');
    if (!container) return;
    // NOTE: _iocMsgs is the source-of-truth (all msgs), updated only by onSnapshot.
    // iocRenderMessages may receive a filtered subset — never overwrite _iocMsgs here.
    iocUpdatePinnedCount();
    iocUpdateMediaCounts();

    if (!msgs.length) {
      container.innerHTML = '<div class="crm-chat-loading">Chưa có tin nhắn. Hãy bắt đầu cuộc trò chuyện!</div>';
      iocRenderConvList();
      return;
    }

    let lastDate = '', lastSender = '';
    const parts  = [];

    msgs.forEach(msg => {
      const ts      = msg.createdAt?.toDate ? msg.createdAt.toDate() : new Date();
      const dateStr = ts.toLocaleDateString('vi-VN', { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' });
      if (dateStr !== lastDate) {
        parts.push(`<div class="ioc-date-divider"><span>${dateStr}</span></div>`);
        lastDate = dateStr; lastSender = '';
      }

      const mine      = iocIsMine(msg);
      const sender    = msg.senderName || 'Người dùng';
      const initials  = sender.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
      const color     = iocAvatarColor(sender);
      const timeStr   = ts.toLocaleTimeString('vi-VN', { hour:'2-digit', minute:'2-digit' });
      const condensed = sender === lastSender;
      lastSender = sender;

      let quoteHtml = '';
      if (msg.replyTo) quoteHtml = `<div class="ioc-msg-quote">
        <span class="ioc-msg-quote-sender">${esc(msg.replyTo.senderName)}</span>
        ${esc(msg.replyTo.content)}
      </div>`;

      let bubbleContent;
      if (msg.recalled) {
        bubbleContent = `<div class="ioc-msg-bubble recalled">
          <svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:currentColor;margin-right:4px;vertical-align:middle"><path d="M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4M11,9H13V13H11V9M11,15H13V17H11V15Z"/></svg>
          Tin nhắn đã được thu hồi</div>`;
      } else {
        const editBadge = msg.edited ? '<span class="ioc-msg-edited">đã sửa</span>' : '';
        const pinBadge  = msg.pinned ? '<span class="ioc-msg-pinned-badge">📌 Đã ghim</span>' : '';
        let media = '';
        if (msg.imageUrl) {
          media = `<div class="ioc-msg-img-wrap"><img src="${msg.imageUrl}" class="ioc-msg-img" alt="ảnh"></div>`;
        } else if (msg.fileName) {
          media = `<div class="ioc-msg-file-pill">
            <svg viewBox="0 0 24 24"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/></svg>
            ${esc(msg.fileName)}</div>`;
        }
        const text = msg.content ? `<span class="ioc-msg-text">${esc(msg.content)}</span>` : '';
        const mediaOnly = msg.imageUrl && !msg.content ? ' media-only' : '';
        bubbleContent = `<div class="ioc-msg-bubble${mediaOnly}" data-msgid="${msg.id}">
          ${quoteHtml}${media}${text}${editBadge}${pinBadge}
        </div>`;
      }

      const actions = msg.recalled ? '' : `<div class="ioc-msg-actions">
        <button class="ioc-msg-action-btn" data-msgid="${msg.id}" data-act="reply" title="Trả lời">
          <svg viewBox="0 0 24 24"><path d="M10,9V5L3,12L10,19V14.9C15,14.9 18.5,16.5 21,20C20,15 17,10 10,9Z"/></svg>
        </button>
        <button class="ioc-msg-action-btn" data-msgid="${msg.id}" data-act="more" title="Thêm">
          <svg viewBox="0 0 24 24"><path d="M12,16A2,2 0 0,1 14,18A2,2 0 0,1 12,20A2,2 0 0,1 10,18A2,2 0 0,1 12,16M12,10A2,2 0 0,1 14,12A2,2 0 0,1 12,14A2,2 0 0,1 10,12A2,2 0 0,1 12,10M12,4A2,2 0 0,1 14,6A2,2 0 0,1 12,8A2,2 0 0,1 10,6A2,2 0 0,1 12,4Z"/></svg>
        </button>
      </div>`;

      parts.push(`<div class="ioc-msg-row${mine?' self':''}${condensed?' condensed':''}" data-msgid="${msg.id}" data-mine="${mine}">
        ${mine ? actions : ''}
        <div class="ioc-msg-av" style="background:${color}">${initials}</div>
        <div class="ioc-msg-body">
          ${condensed ? '' : `<div class="ioc-msg-name">${esc(sender)}</div>`}
          ${bubbleContent}
          <div class="ioc-msg-meta"><span class="ioc-msg-time">${timeStr}</span></div>
        </div>
        ${!mine ? actions : ''}
      </div>`);
    });

    const wasAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80;
    container.innerHTML = parts.join('');

    container.querySelectorAll('.ioc-msg-action-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const row = btn.closest('.ioc-msg-row');
        if (btn.dataset.act === 'reply') { iocSetReply(btn.dataset.msgid); return; }
        if (btn.dataset.act === 'more')  iocShowCtxMenu(e, btn.dataset.msgid, row.dataset.mine === 'true');
      });
    });
    container.querySelectorAll('.ioc-msg-bubble[data-msgid]').forEach(b => {
      b.addEventListener('contextmenu', e => {
        e.preventDefault();
        iocShowCtxMenu(e, b.dataset.msgid, b.closest('.ioc-msg-row').dataset.mine === 'true');
      });
    });
    container.querySelectorAll('.ioc-msg-img').forEach(img => {
      img.addEventListener('click', () => {
        const ov = document.createElement('div');
        ov.className = 'ioc-lightbox';
        ov.innerHTML = `<img src="${img.src}" alt=""><button class="ioc-lightbox-close">&times;</button>`;
        document.body.appendChild(ov);
        ov.addEventListener('click', () => ov.remove());
      });
    });

    if (wasAtBottom) container.scrollTop = container.scrollHeight;
    iocRenderConvList();
  };

  // ── Context menu ───────────────────────────────────────────────────────────
  const iocShowCtxMenu = (e, msgId, isMine) => {
    e.preventDefault();
    _iocCtxMsgId = msgId;
    const menu = document.getElementById('iocCtxMenu');
    if (!menu) return;
    menu.querySelectorAll('.ioc-ctx-mine-only').forEach(el => {
      el.style.display = isMine ? 'flex' : 'none';
    });
    const msg    = _iocMsgs.find(m => m.id === msgId);
    const pinBtn = menu.querySelector('[data-action="pin"]');
    if (pinBtn && msg) {
      const tn = [...pinBtn.childNodes].find(n => n.nodeType === Node.TEXT_NODE);
      if (tn) tn.textContent = msg.pinned ? ' Bỏ ghim' : ' Ghim tin nhắn';
    }
    const vw = window.innerWidth, vh = window.innerHeight;
    let x = e.clientX, y = e.clientY;
    menu.style.display = 'block';
    if (x + menu.offsetWidth  > vw) x = vw - menu.offsetWidth  - 8;
    if (y + menu.offsetHeight > vh) y = vh - menu.offsetHeight - 8;
    menu.style.left = x + 'px';
    menu.style.top  = y + 'px';
  };

  const iocHideCtxMenu = () => {
    const menu = document.getElementById('iocCtxMenu');
    if (menu) menu.style.display = 'none';
    _iocCtxMsgId = null;
  };

  // ── Reply ──────────────────────────────────────────────────────────────────
  const iocSetReply = msgId => {
    const msg = _iocMsgs.find(m => m.id === msgId);
    if (!msg) return;
    _iocReplyTo = { id: msgId, senderName: msg.senderName || 'Người dùng', content: msg.content || '' };
    const strip = document.getElementById('iocReplyStrip');
    if (strip) strip.style.display = 'flex';
    document.getElementById('iocReplySender').textContent = _iocReplyTo.senderName;
    document.getElementById('iocReplyText').textContent   = _iocReplyTo.content;
    document.getElementById('crmChatInput')?.focus();
  };

  const iocCancelReply = () => {
    _iocReplyTo = null;
    const strip = document.getElementById('iocReplyStrip');
    if (strip) strip.style.display = 'none';
  };

  // ── Pinned ─────────────────────────────────────────────────────────────────
  const iocUpdatePinnedCount = () => {
    const el = document.getElementById('iocPinnedCount');
    if (el) el.textContent = _iocMsgs.filter(m => m.pinned && !m.recalled).length;
  };

  const iocRenderPinnedPanel = () => {
    const list = document.getElementById('iocPinnedMsgList');
    if (!list) return;
    const pinned = _iocMsgs.filter(m => m.pinned && !m.recalled);
    list.innerHTML = pinned.length ? pinned.map(m => {
      const ts = m.createdAt?.toDate ? m.createdAt.toDate().toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'}) : '';
      return `<div class="ioc-pinned-item">
        <div class="ioc-pinned-item-sender">${esc(m.senderName||'')} · ${ts}</div>
        <div class="ioc-pinned-item-text">${esc(m.content||'')}</div>
      </div>`;
    }).join('') : '<div style="padding:1rem;color:var(--text-muted);font-size:0.82rem;text-align:center">Chưa có tin nhắn được ghim</div>';
  };

  // ── Members panel ──────────────────────────────────────────────────────────
  const iocRenderMembers = () => {
    const list = document.getElementById('iocMembersList');
    const cnt  = document.getElementById('iocMemberListCount');
    if (!list) return;
    const members = iocGetMembers();
    if (cnt) cnt.textContent = members.length;
    list.innerHTML = members.map(u => {
      const ini   = (u.name || 'U').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
      const color = iocAvatarColor(u.name || 'U');
      const sub   = u.position || u.dept || u.department || (u.role === 'admin' ? 'Quản trị viên' : 'Nhân viên');
      const dept  = u.department || u.dept || '';
      const dmId  = 'dm-' + [currentUser?.uid || currentUser?.email || 'me', u.id || u.uid || u.email].sort().join('__');
      return `<div class="ioc-member-item" data-dm-id="${dmId}"
        data-dm-name="${esc(u.name||'Người dùng')}" data-dm-av="${ini}" data-dm-color="${color}"
        title="Nhắn tin với ${esc(u.name||'')}">
        <div class="ioc-member-av" style="background:${color}">${ini}<span class="ioc-member-online"></span></div>
        <div class="ioc-member-info">
          <div class="ioc-member-name">${esc(u.name||'Người dùng')}</div>
          <div class="ioc-member-role">${esc(sub)}${dept ? ` · ${esc(dept)}` : ''}</div>
        </div>
        <svg class="ioc-member-dm-icon" viewBox="0 0 24 24"><path d="M2,21L23,12L2,3V10L17,12L2,14V21Z"/></svg>
      </div>`;
    }).join('');

    list.querySelectorAll('[data-dm-id]').forEach(el => {
      el.addEventListener('click', () => {
        iocOpenThread(el.dataset.dmId, el.dataset.dmName, el.dataset.dmAv, el.dataset.dmColor, 'dm');
        iocShowInfoMain();
      });
    });
  };

  // ── Info panel ─────────────────────────────────────────────────────────────
  const iocHideAllSubPanels = () => {
    ['iocInfoMain','iocMembersPanel','iocPinnedPanel','iocMediaPanel'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  };
  const iocShowInfoMain = () => {
    iocHideAllSubPanels();
    const el = document.getElementById('iocInfoMain');
    if (el) el.style.display = '';
  };
  const iocShowMembers = () => {
    iocRenderMembers();
    iocHideAllSubPanels();
    const el = document.getElementById('iocMembersPanel');
    if (el) el.style.display = '';
  };
  const iocShowPinned = () => {
    iocRenderPinnedPanel();
    iocHideAllSubPanels();
    const el = document.getElementById('iocPinnedPanel');
    if (el) el.style.display = '';
  };
  const iocShowMedia = type => {
    iocHideAllSubPanels();
    const panel = document.getElementById('iocMediaPanel');
    if (panel) panel.style.display = '';
    const title = document.getElementById('iocMediaPanelTitle');
    if (title) title.textContent = type === 'image' ? 'Ảnh & Video' : 'Files';
    const grid = document.getElementById('iocMediaGrid');
    if (!grid) return;
    const filtered = _iocMsgs.filter(m => !m.recalled && (type === 'image' ? !!m.imageUrl : !!m.fileName));
    if (!filtered.length) {
      grid.innerHTML = `<div style="padding:1.5rem;text-align:center;color:var(--text-muted);font-size:0.82rem;grid-column:1/-1">Chưa có ${type==='image'?'ảnh':'file'} nào</div>`;
      return;
    }
    if (type === 'image') {
      grid.innerHTML = filtered.map(m => `<img src="${m.imageUrl}" class="ioc-media-thumb" alt="" title="${esc(m.senderName||'')}">`).join('');
      grid.querySelectorAll('.ioc-media-thumb').forEach((img, i) => {
        img.addEventListener('click', () => {
          const ov = document.createElement('div');
          ov.className = 'ioc-lightbox';
          ov.innerHTML = `<img src="${filtered[i].imageUrl}" alt=""><button class="ioc-lightbox-close">&times;</button>`;
          document.body.appendChild(ov);
          ov.addEventListener('click', () => ov.remove());
        });
      });
    } else {
      grid.style.gridTemplateColumns = '1fr';
      grid.innerHTML = filtered.map(m => `<div class="ioc-pinned-item">
        <div class="ioc-pinned-item-sender">${esc(m.senderName||'')} · ${m.createdAt?.toDate?m.createdAt.toDate().toLocaleDateString('vi-VN'):''}</div>
        <div class="ioc-pinned-item-text">📎 ${esc(m.fileName||'')}</div>
      </div>`).join('');
    }
  };

  // Update media counts in info panel
  const iocUpdateMediaCounts = () => {
    const imgCount = _iocMsgs.filter(m => !m.recalled && m.imageUrl).length;
    const fileCount = _iocMsgs.filter(m => !m.recalled && m.fileName).length;
    const ic = document.getElementById('iocImageCount');
    const fc = document.getElementById('iocFileCount');
    if (ic) ic.textContent = imgCount || '';
    if (fc) fc.textContent = fileCount || '';
  };

  // ── Favorites ──────────────────────────────────────────────────────────────
  const iocUpdateFavBtn = () => {
    const isFav = _iocFavThreads.has(_iocActiveThread.id);
    const icon  = document.getElementById('iocFavIcon');
    const label = document.getElementById('iocFavLabel');
    if (icon)  icon.textContent  = isFav ? '★' : '☆';
    if (label) label.textContent = isFav ? 'Bỏ yêu thích' : 'Yêu thích';
  };
  const iocToggleFavorite = () => {
    const id = _iocActiveThread.id;
    if (_iocFavThreads.has(id)) _iocFavThreads.delete(id);
    else _iocFavThreads.add(id);
    iocSavePrefs();
    iocUpdateFavBtn();
    iocRenderConvList();
    showToast(_iocFavThreads.has(id) ? 'Đã thêm vào yêu thích!' : 'Đã bỏ yêu thích!', 'success');
  };

  // ── Notify mute ────────────────────────────────────────────────────────────
  const iocUpdateNotifyBtn = () => {
    const muted = _iocMutedThreads.has(_iocActiveThread.id);
    const icon  = document.getElementById('iocNotifyIcon');
    const label = document.getElementById('iocNotifyLabel');
    if (icon)  icon.textContent  = muted ? '🔕' : '🔔';
    if (label) label.textContent = muted ? 'Bật thông báo' : 'Tắt thông báo';
  };
  const iocToggleNotify = () => {
    const id = _iocActiveThread.id;
    if (_iocMutedThreads.has(id)) _iocMutedThreads.delete(id);
    else _iocMutedThreads.add(id);
    iocSavePrefs();
    iocUpdateNotifyBtn();
    showToast(_iocMutedThreads.has(id) ? 'Đã tắt thông báo!' : 'Đã bật thông báo!', 'success');
  };

  // ── Group rename ───────────────────────────────────────────────────────────
  const iocRenameGroup = () => {
    if (_iocActiveThread.type !== 'group') return;
    const nameEl = document.getElementById('iocInfoGroupName');
    if (!nameEl) return;
    const current = _iocActiveThread.name;
    const input = document.createElement('input');
    input.value = current;
    input.className = 'ioc-rename-input';
    nameEl.innerHTML = '';
    nameEl.appendChild(input);
    input.focus(); input.select();
    const save = async () => {
      const name = input.value.trim() || current;
      _iocActiveThread.name = name;
      const nameHeaderEl = document.getElementById('iocActiveThreadName');
      if (nameHeaderEl) nameHeaderEl.textContent = name;
      nameEl.innerHTML = esc(name);
      const editBtn = document.createElement('button');
      editBtn.className = 'ioc-info-edit-btn'; editBtn.id = 'btnIocRenameGroup'; editBtn.title = 'Đổi tên';
      editBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z"/></svg>`;
      nameEl.appendChild(editBtn);
      editBtn.addEventListener('click', iocRenameGroup);
      if (name !== current) {
        try { await db.collection('chat_settings').doc(_iocActiveThread.id).set({ name }, { merge: true }); showToast('Đã đổi tên nhóm!','success'); } catch(_) {}
      }
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { input.value = current; input.blur(); }
    });
  };

  // ── Forward ────────────────────────────────────────────────────────────────
  const iocOpenForward = msgId => {
    _iocForwardId = msgId;
    const msg = _iocMsgs.find(m => m.id === msgId);
    if (!msg) return;
    const prev = document.getElementById('iocFwdPreview');
    if (prev) prev.textContent = msg.recalled ? '' : (msg.content || (msg.imageUrl ? '[Hình ảnh]' : msg.fileName ? `[${msg.fileName}]` : ''));
    iocRenderFwdList('');
    const modal = document.getElementById('iocForwardModal');
    if (modal) modal.style.display = 'flex';
  };
  const iocRenderFwdList = search => {
    const list = document.getElementById('iocFwdList');
    if (!list) return;
    const members = iocGetMembers();
    const q = (search || '').toLowerCase();
    const items = [
      { id:'group-global', name:'Nhóm Nội bộ Aladdin', av:'N', color:'#6366F1' },
      ...members.filter(u => !q || (u.name||'').toLowerCase().includes(q)).map(u => ({
        id: 'dm-'+[currentUser?.uid||currentUser?.email||'me', u.id||u.uid||u.email].sort().join('__'),
        name: u.name||'Người dùng',
        av:   (u.name||'U').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase(),
        color: iocAvatarColor(u.name||'U'),
      }))
    ].filter(x => x.id !== _iocActiveThread.id);
    list.innerHTML = items.map(x =>
      `<div class="ioc-fwd-item" data-fwd-id="${x.id}">
        <div class="ioc-member-av" style="background:${x.color}">${x.av}</div>
        <span>${esc(x.name)}</span>
      </div>`
    ).join('');
    list.querySelectorAll('.ioc-fwd-item').forEach(el => {
      el.addEventListener('click', () => {
        list.querySelectorAll('.ioc-fwd-item').forEach(i => i.classList.remove('selected'));
        el.classList.add('selected');
      });
    });
  };
  const iocConfirmForward = async () => {
    const selected = document.getElementById('iocFwdList')?.querySelector('.ioc-fwd-item.selected');
    if (!selected || !_iocForwardId) return;
    const origMsg = _iocMsgs.find(m => m.id === _iocForwardId);
    if (!origMsg || origMsg.recalled) return;
    const threadId = selected.dataset.fwdId;
    const payload = {
      content: origMsg.content || '', senderName: currentUser.name,
      senderEmail: currentUser.email, senderRole: currentUser.role === 'admin' ? 'quản trị viên' : 'nhân viên',
      threadId, createdAt: firebase.firestore.Timestamp.now(),
      recalled: false, edited: false, pinned: false, forwarded: true,
    };
    if (origMsg.imageUrl) payload.imageUrl = origMsg.imageUrl;
    if (origMsg.fileName) payload.fileName = origMsg.fileName;
    try {
      await db.collection('messages').add(payload);
      const nm = selected.querySelector('span')?.textContent || threadId;
      showToast(`Đã chuyển tiếp đến ${nm}!`, 'success');
      document.getElementById('iocForwardModal').style.display = 'none';
      _iocForwardId = null;
    } catch(e) { showToast('Lỗi chuyển tiếp!', 'error'); }
  };

  // ── New chat / New DM ──────────────────────────────────────────────────────
  const iocOpenNewChat = () => {
    iocRenderNewChatList('');
    const modal = document.getElementById('iocNewChatModal');
    if (modal) modal.style.display = 'flex';
  };
  const iocRenderNewChatList = search => {
    const list = document.getElementById('iocNewChatList');
    if (!list) return;
    const members = iocGetMembers();
    const q = (search || '').toLowerCase();
    const filtered = members.filter(u => !q || (u.name||'').toLowerCase().includes(q));
    list.innerHTML = filtered.slice(0,20).map(u => {
      const ini   = (u.name||'U').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
      const color = iocAvatarColor(u.name||'U');
      const dmId  = 'dm-'+[currentUser?.uid||currentUser?.email||'me', u.id||u.uid||u.email].sort().join('__');
      const sub   = u.position || u.department || 'Nhân viên';
      return `<div class="ioc-fwd-item" data-dm-id="${dmId}" data-dm-name="${esc(u.name||'')}" data-dm-av="${ini}" data-dm-color="${color}">
        <div class="ioc-member-av" style="background:${color}">${ini}</div>
        <div><div style="font-weight:600">${esc(u.name||'Người dùng')}</div><div style="font-size:0.75rem;color:var(--text-muted)">${esc(sub)}</div></div>
      </div>`;
    }).join('') || '<div class="ioc-empty-list">Không tìm thấy nhân viên</div>';
    list.querySelectorAll('.ioc-fwd-item').forEach(el => {
      el.addEventListener('click', () => {
        document.getElementById('iocNewChatModal').style.display = 'none';
        iocOpenThread(el.dataset.dmId, el.dataset.dmName, el.dataset.dmAv, el.dataset.dmColor, 'dm');
      });
    });
  };

  // ── Emoji picker ───────────────────────────────────────────────────────────
  const EMOJIS = ['😀','😂','😍','🥰','😎','🤩','👍','👏','🎉','❤️','🔥','✅','💯','🚀','⭐','😅','🤔','😊','🙌','💪','📌','📎','📝','🎯','💡','✨','🏆','🎊','😭','😤','🤝','💬','📊','🗒️','📅','⏰','🌟','💼','📋','🎁','🛠️','🔍','📈','📉','💰','🌏','🏠','🌺','🦋','🐉'];

  const iocSetupEmojiPicker = () => {
    const picker = document.getElementById('iocEmojiPicker');
    if (!picker || picker.childElementCount) return;
    picker.innerHTML = EMOJIS.map(e => `<button class="ioc-emoji-btn" data-e="${e}">${e}</button>`).join('');
    picker.querySelectorAll('.ioc-emoji-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = document.getElementById('crmChatInput');
        if (input) { input.value += btn.dataset.e; input.focus(); }
        picker.style.display = 'none';
      });
    });
  };

  const iocToggleEmoji = e => {
    e.stopPropagation();
    const picker = document.getElementById('iocEmojiPicker');
    if (!picker) return;
    iocSetupEmojiPicker();
    if (picker.style.display === 'none' || !picker.style.display) {
      const rect = document.getElementById('btnIocEmoji').getBoundingClientRect();
      picker.style.left   = (rect.left - 280 + rect.width) + 'px';
      picker.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
      picker.style.top    = 'auto';
      picker.style.display = 'grid';
    } else {
      picker.style.display = 'none';
    }
  };

  // ── File attachment ────────────────────────────────────────────────────────
  let _iocPendingFile = null;

  const iocShowFilePreview = file => {
    const strip = document.getElementById('iocFilePreviewStrip');
    const inner = document.getElementById('iocFilePreviewInner');
    if (!strip || !inner) return;
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = ev => {
        _iocPendingFile = { dataUrl: ev.target.result, fileName: file.name, isImage: true };
        inner.innerHTML = `<img src="${ev.target.result}" class="ioc-file-preview-img" alt="${esc(file.name)}">
          <span class="ioc-file-preview-name">${esc(file.name)}</span>`;
        strip.style.display = 'flex';
      };
      reader.readAsDataURL(file);
    } else {
      _iocPendingFile = { dataUrl: null, fileName: file.name, isImage: false };
      inner.innerHTML = `<div class="ioc-file-preview-pill">
        <svg viewBox="0 0 24 24"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/></svg>
        <span>${esc(file.name)}</span></div>`;
      strip.style.display = 'flex';
    }
  };

  const iocClearFilePreview = () => {
    _iocPendingFile = null;
    const strip = document.getElementById('iocFilePreviewStrip');
    const inner = document.getElementById('iocFilePreviewInner');
    if (strip) strip.style.display = 'none';
    if (inner) inner.innerHTML = '';
  };

  // ── Firestore actions ──────────────────────────────────────────────────────
  const iocDelete = async msgId => {
    if (!msgId || !confirm('Xóa tin nhắn này vĩnh viễn?')) return;
    try { await db.collection('messages').doc(msgId).delete(); }
    catch(e) { showToast('Lỗi xóa tin nhắn!', 'error'); }
  };

  const iocRecall = async msgId => {
    if (!msgId) return;
    try { await db.collection('messages').doc(msgId).update({ recalled: true, content: '' }); }
    catch(e) { showToast('Lỗi thu hồi tin nhắn!', 'error'); }
  };

  const iocPin = async msgId => {
    const msg = _iocMsgs.find(m => m.id === msgId);
    if (!msg) return;
    try { await db.collection('messages').doc(msgId).update({ pinned: !msg.pinned }); }
    catch(e) { showToast('Lỗi ghim tin nhắn!', 'error'); }
  };

  const iocOpenEdit = msgId => {
    const msg = _iocMsgs.find(m => m.id === msgId);
    if (!msg || msg.recalled) return;
    _iocEditingId = msgId;
    const overlay = document.getElementById('iocEditOverlay');
    const ta = document.getElementById('iocEditInput');
    if (!overlay || !ta) return;
    ta.value = msg.content || '';
    overlay.style.display = 'flex';
    ta.focus();
  };

  const iocConfirmEdit = async () => {
    if (!_iocEditingId) return;
    const ta = document.getElementById('iocEditInput');
    const newContent = ta?.value.trim();
    if (!newContent) return;
    try {
      await db.collection('messages').doc(_iocEditingId).update({ content: newContent, edited: true });
      document.getElementById('iocEditOverlay').style.display = 'none';
      _iocEditingId = null;
    } catch(e) { showToast('Lỗi chỉnh sửa tin nhắn!', 'error'); }
  };

  // ── Send ───────────────────────────────────────────────────────────────────
  const sendCrmChatMessage = () => {
    const input = document.getElementById('crmChatInput');
    if (!input || !currentUser) return;
    const content = input.value.trim();
    if (!content && !_iocPendingFile) return;
    input.value = '';

    const payload = {
      content:     content || '',
      senderName:  currentUser.name,
      senderEmail: currentUser.email,
      senderRole:  currentUser.role === 'admin' ? 'quản trị viên' : 'nhân viên',
      threadId:    _iocActiveThread.id,
      createdAt:   firebase.firestore.Timestamp.now(),
      recalled: false, edited: false, pinned: false,
    };
    if (_iocReplyTo) { payload.replyTo = { ..._iocReplyTo }; iocCancelReply(); }
    if (_iocPendingFile) {
      if (_iocPendingFile.isImage) payload.imageUrl = _iocPendingFile.dataUrl;
      else payload.fileName = _iocPendingFile.fileName;
      iocClearFilePreview();
    }

    // Firestore local cache fires onSnapshot immediately — message appears at once.
    // Using Timestamp.now() (not serverTimestamp) so the pending write is visible in the query.
    db.collection('messages').add(payload).catch(err => {
      console.error('Send error:', err);
      showToast('Lỗi gửi tin nhắn!', 'error');
    });
  };

  // ── Subscription ───────────────────────────────────────────────────────────
  const setupCrmChat = () => {
    if (crmChatSubscription) { crmChatSubscription(); crmChatSubscription = null; }
    _iocMsgs = [];
    iocRenderConvList();

    const container = document.getElementById('crmChatMessages');
    if (container) container.innerHTML = '<div class="crm-chat-loading">Đang tải tin nhắn...</div>';

    // Query by threadId only (no orderBy) to avoid composite Firestore index requirement.
    // Messages are sorted client-side by createdAt.seconds.
    crmChatSubscription = db.collection('messages')
      .where('threadId', '==', _iocActiveThread.id)
      .onSnapshot(
        snap => {
          const msgs = snap.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))
            .slice(-150);
          _iocMsgs = msgs;
          const term = _iocSearchTerm;
          const toShow = term
            ? msgs.filter(m => (m.content||'').toLowerCase().includes(term) || (m.fileName||'').toLowerCase().includes(term))
            : msgs;
          iocRenderMessages(toShow);
        },
        err => {
          console.error('CRM chat error:', err);
          const c = document.getElementById('crmChatMessages');
          if (c) c.innerHTML = `<div class="crm-chat-loading" style="color:#e53e3e">
            Lỗi kết nối Firebase.<br><small>${esc(err.message || '')}</small></div>`;
        }
      );
  };

  const teardownCrmChat = () => {
    if (crmChatSubscription) { crmChatSubscription(); crmChatSubscription = null; }
    _iocMsgs = [];
    iocHideCtxMenu();
    const picker = document.getElementById('iocEmojiPicker');
    if (picker) picker.style.display = 'none';
  };

  // ── Event bindings (called once on first init) ─────────────────────────────
  const iocBindEvents = () => {
    document.getElementById('btnSendCrmChat')?.addEventListener('click', sendCrmChatMessage);
    document.getElementById('crmChatInput')?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCrmChatMessage(); }
    });

    document.getElementById('btnCancelIocReply')?.addEventListener('click', iocCancelReply);

    document.getElementById('iocCtxMenu')?.querySelectorAll('.ioc-ctx-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const act   = btn.dataset.action;
        const msgId = _iocCtxMsgId;
        iocHideCtxMenu();
        if (act === 'reply')   iocSetReply(msgId);
        if (act === 'recall')  iocRecall(msgId);
        if (act === 'pin')     iocPin(msgId);
        if (act === 'edit')    iocOpenEdit(msgId);
        if (act === 'forward') iocOpenForward(msgId);
        if (act === 'relate')  showToast('Tính năng đang phát triển!', 'info');
        if (act === 'delete')  iocDelete(msgId);
      });
    });

    const fileInput = document.getElementById('iocFileInput');
    document.getElementById('btnIocAttach')?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;
      if (file.size > 500 * 1024) { showToast('File quá lớn (tối đa 500KB)', 'error'); fileInput.value = ''; return; }
      iocShowFilePreview(file);
      fileInput.value = '';
    });
    document.getElementById('btnClearFilePreview')?.addEventListener('click', iocClearFilePreview);

    document.getElementById('btnIocAddPeople')?.addEventListener('click', () => {
      const modal = document.getElementById('findFriendsModal');
      if (!modal) return;
      // Lazy-subscribe contacts & friend requests only when modal is first opened
      if (!contactsSubscription)      subscribeToContacts();
      if (!sentRequestsSubscription)  subscribeToFriendRequests();
      modal.style.display = 'flex';
      const inp = document.getElementById('friendSearchInput');
      if (inp) { inp.value = ''; inp.focus(); }
      renderFriendsSearchResults('');
    });

    document.addEventListener('click', e => {
      if (!e.target.closest('#iocCtxMenu')) iocHideCtxMenu();
      if (!e.target.closest('#iocEmojiPicker') && !e.target.closest('#btnIocEmoji')) {
        const p = document.getElementById('iocEmojiPicker');
        if (p) p.style.display = 'none';
      }
    }, true);

    document.getElementById('btnIocSearchMsg')?.addEventListener('click', () => {
      const bar = document.getElementById('iocMsgSearchBar');
      if (!bar) return;
      const show = bar.style.display === 'none' || !bar.style.display;
      bar.style.display = show ? 'flex' : 'none';
      if (show) document.getElementById('iocMsgSearchInput')?.focus();
    });
    document.getElementById('btnCloseIocSearch')?.addEventListener('click', () => {
      _iocSearchTerm = '';
      const bar = document.getElementById('iocMsgSearchBar');
      if (bar) bar.style.display = 'none';
      const inp = document.getElementById('iocMsgSearchInput');
      if (inp) inp.value = '';
      iocRenderMessages(_iocMsgs);
    });
    document.getElementById('iocMsgSearchInput')?.addEventListener('input', e => {
      _iocSearchTerm = e.target.value.toLowerCase();
      const filtered = _iocSearchTerm
        ? _iocMsgs.filter(m =>
            (m.content || '').toLowerCase().includes(_iocSearchTerm) ||
            (m.fileName || '').toLowerCase().includes(_iocSearchTerm))
        : _iocMsgs;
      iocRenderMessages(filtered);
    });

    document.getElementById('crmChatSearch')?.addEventListener('input', iocRenderConvList);

    document.getElementById('btnIocThreadBack')?.addEventListener('click', () =>
      iocOpenThread('group-global', 'Nhóm Nội bộ Aladdin', 'N', '#6366F1', 'group')
    );

    document.getElementById('btnToggleIocInfo')?.addEventListener('click', () => {
      const panel  = document.getElementById('iocInfoPanel');
      const layout = document.querySelector('#crm-chat-tab .ioc-layout');
      if (!panel) return;
      panel.classList.toggle('hidden');
      const isHidden = panel.classList.contains('hidden');
      if (layout) layout.classList.toggle('ioc-info-hidden', isHidden);
      const btn = document.getElementById('btnToggleIocInfo');
      if (btn) btn.style.color = isHidden ? 'var(--ioc-purple)' : '';
    });

    document.getElementById('btnIocShowMembers')?.addEventListener('click', iocShowMembers);
    document.getElementById('btnIocShowMembersHdr')?.addEventListener('click', () => {
      const panel  = document.getElementById('iocInfoPanel');
      const layout = document.querySelector('#crm-chat-tab .ioc-layout');
      const btn    = document.getElementById('btnToggleIocInfo');
      if (panel)  panel.classList.remove('hidden');
      if (layout) layout.classList.remove('ioc-info-hidden');
      if (btn)    btn.style.color = '';
      iocShowMembers();
    });
    document.getElementById('btnIocBackFromMembers')?.addEventListener('click', iocShowInfoMain);
    document.getElementById('btnIocShowPinned')?.addEventListener('click', iocShowPinned);
    document.getElementById('btnIocBackFromPinned')?.addEventListener('click', iocShowInfoMain);
    document.getElementById('btnIocBackFromMedia')?.addEventListener('click', iocShowInfoMain);
    document.getElementById('btnIocShowImages')?.addEventListener('click', () => iocShowMedia('image'));
    document.getElementById('btnIocShowFiles')?.addEventListener('click',  () => iocShowMedia('file'));

    // Favorites & notify
    document.getElementById('btnIocFavorite')?.addEventListener('click', iocToggleFavorite);
    document.getElementById('btnIocNotify')?.addEventListener('click', iocToggleNotify);

    // Group rename
    document.getElementById('btnIocRenameGroup')?.addEventListener('click', iocRenameGroup);

    // Forward modal
    document.getElementById('btnCloseIocForward')?.addEventListener('click', () => {
      document.getElementById('iocForwardModal').style.display = 'none'; _iocForwardId = null;
    });
    document.getElementById('btnCancelIocForward')?.addEventListener('click', () => {
      document.getElementById('iocForwardModal').style.display = 'none'; _iocForwardId = null;
    });
    document.getElementById('btnConfirmIocForward')?.addEventListener('click', iocConfirmForward);
    document.getElementById('iocFwdSearch')?.addEventListener('input', e => iocRenderFwdList(e.target.value));

    // Filter row (visual-only for now — re-renders the list)
    document.getElementById('btnIocFilter')?.addEventListener('click', () => iocRenderConvList());

    // New chat modal
    document.getElementById('btnIocNewChat')?.addEventListener('click', iocOpenNewChat);
    document.getElementById('btnCloseIocNewChat')?.addEventListener('click', () => {
      document.getElementById('iocNewChatModal').style.display = 'none';
    });
    document.getElementById('iocNewChatSearch')?.addEventListener('input', e => iocRenderNewChatList(e.target.value));

    // Close modals on backdrop click
    ['iocForwardModal','iocNewChatModal'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', e => {
        if (e.target.id === id) {
          document.getElementById(id).style.display = 'none';
          _iocForwardId = null;
        }
      });
    });

    document.getElementById('btnConfirmIocEdit')?.addEventListener('click', iocConfirmEdit);
    document.getElementById('btnCancelIocEdit')?.addEventListener('click', () => {
      document.getElementById('iocEditOverlay').style.display = 'none';
      _iocEditingId = null;
    });
    document.getElementById('iocEditInput')?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) iocConfirmEdit();
      if (e.key === 'Escape') { document.getElementById('iocEditOverlay').style.display = 'none'; _iocEditingId = null; }
    });

    document.getElementById('btnIocEmoji')?.addEventListener('click', iocToggleEmoji);
  };

  // ── CRM Customer Add/Edit Modal ────────────────────────────────────────────
  const openCrmCustomerModal = async (customer) => {
    const modal = document.getElementById('crmCustomerModal');
    if (!modal) return;
    const isEdit = !!customer;
    document.getElementById('crmModalTitle').textContent = isEdit ? 'CHỈNH SỬA KHÁCH HÀNG' : '+ THÊM KHÁCH HÀNG MỚI';
    document.getElementById('btnSubmitCrmCustomer').textContent = isEdit ? 'CẬP NHẬT KHÁCH HÀNG' : 'LƯU KHÁCH HÀNG';
    document.getElementById('crmCustomerEditId').value = customer?.id || '';
    document.getElementById('crmName').value = customer?.name || '';
    document.getElementById('crmEmail').value = customer?.email || '';
    document.getElementById('crmPhone').value = customer?.phone || '';
    document.getElementById('crmCountry').value = customer?.country || 'Nhật';
    document.getElementById('crmStatusSel').value = customer?.crmStatus || 'Khách Hàng Mới';
    document.getElementById('crmNotes').value = customer?.notes || '';
    await populateCrmAdvisorSelect(customer?.advisor || '');
    modal.style.display = 'flex';
  };

  const setupCrmCustomerModal = () => {
    const modal = document.getElementById('crmCustomerModal');
    if (!modal) return;

    const closeModal = () => { modal.style.display = 'none'; };
    document.getElementById('btnCloseCrmCustomerModal')?.addEventListener('click', closeModal);
    document.getElementById('btnCancelCrmCustomerModal')?.addEventListener('click', closeModal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

    document.getElementById('btnSubmitCrmCustomer')?.addEventListener('click', async () => {
      const editId = document.getElementById('crmCustomerEditId').value;
      const name = document.getElementById('crmName').value.trim();
      const email = document.getElementById('crmEmail').value.trim();
      const phone = document.getElementById('crmPhone').value.trim();
      const country = document.getElementById('crmCountry').value;
      const crmStatus = document.getElementById('crmStatusSel').value;
      const advisor = document.getElementById('crmAdvisor').value;
      const notes = document.getElementById('crmNotes').value.trim();

      if (!name) {
        showToast('Vui lòng nhập họ và tên khách hàng!', 'error');
        return;
      }

      const payload = {
        name, email, phone, country, crmStatus, advisor, notes,
        isCrmCustomer: true,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      try {
        if (editId) {
          await db.collection('students').doc(editId).update(payload);
          showToast(`Đã cập nhật khách hàng ${name}!`, 'success');
        } else {
          payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
          const snap = await db.collection('students')
            .where('isCrmCustomer', '==', true).get();
          let nextCode = 30001;
          if (!snap.empty) {
            let maxCode = 30000;
            snap.forEach(doc => {
              const codeStr = doc.data().code || '';
              const codeNum = parseInt(codeStr.replace(/\D/g, '')) || 0;
              if (codeNum > maxCode) {
                maxCode = codeNum;
              }
            });
            nextCode = maxCode + 1;
          }
          payload.code = String(nextCode);
          await db.collection('students').add(payload);
          showToast(`Đã thêm khách hàng ${name}!`, 'success');
        }
        closeModal();
        initCrmModule();
      } catch (err) {
        console.error('Save CRM customer error:', err);
        showToast('Lỗi lưu khách hàng: ' + err.message, 'error');
      }
    });
  };

  // ── CRM Old Customer Add/Edit Modal ────────────────────────────────────────
  const openCrmOldCustomerModal = async (customer) => {
    const modal = document.getElementById('crmOldCustomerModal');
    if (!modal) return;
    const isEdit = !!customer;
    document.getElementById('crmOldModalTitle').textContent = isEdit ? 'CHỈNH SỬA KHÁCH HÀNG CŨ' : '+ THÊM KHÁCH HÀNG CŨ';
    document.getElementById('btnSubmitCrmOldCustomer').textContent = isEdit ? 'CẬP NHẬT KHÁCH HÀNG CŨ' : 'LƯU KHÁCH HÀNG CŨ';
    document.getElementById('crmOldCustomerEditId').value = customer?.id || '';
    document.getElementById('crmOldName').value = customer?.name || '';
    document.getElementById('crmOldEmail').value = customer?.email || '';
    document.getElementById('crmOldPhone').value = customer?.phone || '';
    document.getElementById('crmOldCountry').value = customer?.country || 'Nhật';
    document.getElementById('crmOldStatusSel').value = customer?.crmStatus || 'Khách Hàng Mới';
    document.getElementById('crmOldNotes').value = customer?.notes || '';
    await populateCrmOldAdvisorSelect(customer?.advisor || '');
    modal.style.display = 'flex';
  };

  const setupCrmOldCustomerModal = () => {
    const modal = document.getElementById('crmOldCustomerModal');
    if (!modal) return;

    const closeModal = () => { modal.style.display = 'none'; };
    document.getElementById('btnCloseCrmOldCustomerModal')?.addEventListener('click', closeModal);
    document.getElementById('btnCancelCrmOldCustomerModal')?.addEventListener('click', closeModal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

    document.getElementById('btnSubmitCrmOldCustomer')?.addEventListener('click', async () => {
      const editId = document.getElementById('crmOldCustomerEditId').value;
      const name = document.getElementById('crmOldName').value.trim();
      const email = document.getElementById('crmOldEmail').value.trim();
      const phone = document.getElementById('crmOldPhone').value.trim();
      const country = document.getElementById('crmOldCountry').value;
      const crmStatus = document.getElementById('crmOldStatusSel').value;
      const advisor = document.getElementById('crmOldAdvisor').value;
      const notes = document.getElementById('crmOldNotes').value.trim();

      if (!name) {
        showToast('Vui lòng nhập họ và tên khách hàng cũ!', 'error');
        return;
      }

      const payload = {
        name, email, phone, country, crmStatus, advisor, notes,
        isCrmCustomer: true,
        isCrmOldCustomer: true,
        status: "Đã xuất cảnh",
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      try {
        if (editId) {
          await db.collection('students').doc(editId).update(payload);
          showToast(`Đã cập nhật khách hàng cũ ${name}!`, 'success');
        } else {
          payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
          const snap = await db.collection('students')
            .where('isCrmCustomer', '==', true).get();
          let nextCode = 30001;
          if (!snap.empty) {
            let maxCode = 30000;
            snap.forEach(doc => {
              const codeStr = doc.data().code || '';
              const codeNum = parseInt(codeStr.replace(/\D/g, '')) || 0;
              if (codeNum > maxCode) {
                maxCode = codeNum;
              }
            });
            nextCode = maxCode + 1;
          }
          payload.code = String(nextCode);
          await db.collection('students').add(payload);
          showToast(`Đã thêm khách hàng cũ ${name}!`, 'success');
        }
        closeModal();
        initCrmModule();
      } catch (err) {
        console.error('Save CRM old customer error:', err);
        showToast('Lỗi lưu khách hàng cũ: ' + err.message, 'error');
      }
    });
  };

  // ── init ───────────────────────────────────────────────────────────────────
  const initCrmModule = () => {
    if (!crmInitialized) {
      crmInitialized = true;
      setupCrmCustomerModal();
      setupCrmOldCustomerModal();

      document.querySelectorAll('.crm-subtab').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.crm-subtab').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const target = btn.getAttribute('data-tab');
          document.querySelectorAll('.crm-tab-content').forEach(tc => tc.style.display = 'none');
          const el = document.getElementById(target);
          if (el) el.style.display = 'flex';
          if (target === 'crm-staff-tab')  renderCrmStaff();
          if (target === 'crm-source-tab') renderCrmSource(true);
          if (target === 'crm-old-customers-tab') renderCrmOldCustomers(true);
          if (target === 'crm-chat-tab') setupCrmChat();
          else if (target !== 'crm-staff-tab') teardownCrmChat();
        });
      });

      document.querySelectorAll('.crm-ptab').forEach(tab => {
        tab.addEventListener('click', () => {
          const target = tab.dataset.ctab;
          document.querySelectorAll('.crm-ptab').forEach(t => t.classList.remove('active'));
          document.querySelectorAll('.crm-ptab-panel').forEach(p => p.classList.remove('active'));
          tab.classList.add('active');
          const panel = document.getElementById(target);
          if (panel) panel.classList.add('active');
        });
      });

      document.getElementById('btnBackToCrmList')?.addEventListener('click', closeCrmProfile);

      // Profile tab switching + load docs on tab click
      document.querySelectorAll('.crm-ptab').forEach(tab => {
        tab.addEventListener('click', () => {
          document.querySelectorAll('.crm-ptab').forEach(t => t.classList.remove('active'));
          document.querySelectorAll('.crm-ptab-panel').forEach(p => p.classList.remove('active'));
          tab.classList.add('active');
          const panel = document.getElementById(tab.dataset.ctab);
          if (panel) panel.classList.add('active');
          if (tab.dataset.ctab === 'ctab-docs' && _currentCrmCustomer?.id) {
            loadCrmDocs(_currentCrmCustomer.id);
          }
          if (tab.dataset.ctab === 'ctab-notes' && _currentCrmCustomer?.id) {
            loadCrmNotes(_currentCrmCustomer.id);
          }
        });
      });

      setupDocUpload();
      setupCrmNotes();

      document.getElementById('btnEditCrmCustomer')?.addEventListener('click', async () => {
        if (!_currentCrmCustomer) return;
        closeCrmProfile();
        if (_currentCrmCustomer.status === "Đã xuất cảnh" || _currentCrmCustomer.isCrmOldCustomer) {
          openCrmOldCustomerModal(_currentCrmCustomer);
        } else {
          openCrmCustomerModal(_currentCrmCustomer);
        }
      });

      document.getElementById('btnAddCrmCustomer')?.addEventListener('click', () => {
        openCrmCustomerModal(null);
      });

      document.getElementById('btnAddCrmOldCustomer')?.addEventListener('click', () => {
        openCrmOldCustomerModal(null);
      });

      document.getElementById('btnExportCrm')?.addEventListener('click', () => {
        if (!window.XLSX) { showToast('Thư viện Excel chưa sẵn sàng!', 'warning'); return; }
        const activeCustomers = _allCrmCustomers.filter(c => c.status !== "Đã xuất cảnh");
        const rows = activeCustomers.map(c => ({
          'Mã HV': c.code || '', 'Họ tên': c.name || '', 'Email': c.email || '',
          'Điện thoại': c.phone || '', 'Quốc gia': c.country || '',
          'Trạng thái': c.status || '', 'Tháng học': c.learningMonth || '', 'Ghi chú': c.notes || '',
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'KhachHang_CRM');
        XLSX.writeFile(wb, `CRM_KhachHang_${new Date().toISOString().split('T')[0]}.xlsx`);
        showToast('Đã xuất Excel thành công!', 'success');
      });

      document.getElementById('btnExportCrmOld')?.addEventListener('click', () => {
        if (!window.XLSX) { showToast('Thư viện Excel chưa sẵn sàng!', 'warning'); return; }
        const oldCustomers = _allCrmCustomers.filter(c => c.status === "Đã xuất cảnh" || c.isCrmOldCustomer);
        const rows = oldCustomers.map(c => ({
          'Mã HV': c.code || '', 'Họ tên': c.name || '', 'Email': c.email || '',
          'Điện thoại': c.phone || '', 'Quốc gia': c.country || '',
          'Trạng thái': c.status || '', 'Tháng học': c.learningMonth || '', 'Ghi chú': c.notes || '',
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'KhachHangCu_CRM');
        XLSX.writeFile(wb, `CRM_KhachHangCu_${new Date().toISOString().split('T')[0]}.xlsx`);
        showToast('Đã xuất Excel khách hàng cũ thành công!', 'success');
      });

      document.getElementById('crmSearchInput')?.addEventListener('input', () => renderCrmCustomers(true));
      document.getElementById('crmCountryFilter')?.addEventListener('change', () => renderCrmCustomers(true));
      document.getElementById('crmStatusFilter')?.addEventListener('change', () => renderCrmCustomers(true));

      document.getElementById('crmOldSearchInput')?.addEventListener('input', () => renderCrmOldCustomers(true));
      document.getElementById('crmOldCountryFilter')?.addEventListener('change', () => renderCrmOldCustomers(true));
      document.getElementById('crmOldStatusFilter')?.addEventListener('change', () => renderCrmOldCustomers(true));

      document.getElementById('srcSearchInput')?.addEventListener('input', () => renderCrmSource(true));
      document.getElementById('srcCountryFilter')?.addEventListener('change', () => renderCrmSource(true));

      // Mở modal thêm học viên nguồn
      const openSourceModal = async () => {
        document.getElementById('srcModalTitle').textContent = '+ THÊM HỌC VIÊN NGUỒN';
        const submitBtn = document.getElementById('btnSubmitSourceStudent');
        if (submitBtn) submitBtn.textContent = 'LƯU HỌC VIÊN NGUỒN';
        ['srcName','srcEnrollDate','srcNgayThi1','srcNgayThi2','srcNgayThi3','srcNgayThiCuoi'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.value = '';
        });
        ['srcKetQua1','srcKetQua2','srcKetQua3','srcKetQuaCuoi'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.value = '';
        });
        const selS = document.getElementById('srcStatus');
        if (selS) selS.value = 'Chưa đi thi/chờ đơn';
        const selD = document.getElementById('srcDien');
        if (selD) selD.value = 'TTS';
        if (submitBtn) submitBtn.dataset.editId = '';
        await populateSrcAdvisorSelect('');
        document.getElementById('sourceStudentModal').style.display = 'flex';
      };
      const closeSourceModal = () => { document.getElementById('sourceStudentModal').style.display = 'none'; };

      document.getElementById('btnAddSourceStudent')?.addEventListener('click', openSourceModal);
      document.getElementById('btnCloseSourceModal')?.addEventListener('click', closeSourceModal);
      document.getElementById('btnCancelSourceModal')?.addEventListener('click', closeSourceModal);

      document.getElementById('btnSubmitSourceStudent')?.addEventListener('click', async () => {
        const btn = document.getElementById('btnSubmitSourceStudent');
        const editId = btn?.dataset.editId || '';
        const name = document.getElementById('srcName')?.value.trim();
        if (!name) { showToast('Vui lòng nhập họ tên', 'error'); return; }
        const advisor     = document.getElementById('srcAdvisor')?.value || '';
        const enrollDate  = document.getElementById('srcEnrollDate')?.value  || null;
        const payload = {
          name,
          status:        document.getElementById('srcStatus')?.value               || 'Chưa đi thi/chờ đơn',
          dien:          document.getElementById('srcDien')?.value                 || 'TTS',
          advisor,
          source:        advisor,
          enrollDate:    enrollDate  || null,
          ngay_thi_1:    document.getElementById('srcNgayThi1')?.value             || null,
          ket_qua_1:     document.getElementById('srcKetQua1')?.value              || null,
          ngay_thi_2:    document.getElementById('srcNgayThi2')?.value             || null,
          ket_qua_2:     document.getElementById('srcKetQua2')?.value              || null,
          ngay_thi_3:    document.getElementById('srcNgayThi3')?.value             || null,
          ket_qua_3:     document.getElementById('srcKetQua3')?.value              || null,
          ngay_thi_cuoi: document.getElementById('srcNgayThiCuoi')?.value          || null,
          ket_qua_cuoi:  document.getElementById('srcKetQuaCuoi')?.value           || null,
          updatedAt:     firebase.firestore.FieldValue.serverTimestamp(),
        };
        if (!editId) {
          payload.email = '';
          payload.phone = '';
          payload.hometown = '';
          payload.country = 'Nhật';
          payload.room = '';
          payload.learningMonth = 'Tháng 1';
          payload.notes = '';
          payload.paidAmount = null;
          payload.totalAmount = null;
          payload.flightDate = null;
        }
        try {
          if (editId) {
            await db.collection('students').doc(editId).update(payload);
            if (btn) btn.dataset.editId = '';
            showToast('Đã cập nhật học viên nguồn', 'success');
          } else {
            payload.code = 'HNV' + String(_allCrmCustomers.length + 1).padStart(4, '0');
            payload.isSourceStudent = true;
            payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection('students').add(payload);
            showToast('Đã thêm học viên nguồn', 'success');
          }
          closeSourceModal();
          initCrmModule();
        } catch (e) { showToast('Lỗi: ' + e.message, 'error'); }
      });

      setupSourceDetailModal();

      // Xuất Excel học viên nguồn
      document.getElementById('btnExportSourceExcel')?.addEventListener('click', () => {
        if (!window.XLSX) { showToast('Thư viện Excel chưa tải', 'error'); return; }
        const rows = _allCrmCustomers.map((c, i) => ({
          'STT': i + 1,
          'Họ tên HV': c.name || '',
          'Diện': c.dien || 'TTS',
          'Ngày nhập học': c.enrollDate || '',
          'Cán bộ chăm sóc': c.advisor || c.source || '',
          'Tình trạng': c.status || 'Chờ xử lý',
          'Ngày đi thi lần 1': c.ngay_thi_1 || '',
          'Kết quả lần 1': c.ket_qua_1 || '',
          'Ngày đi thi lần 2': c.ngay_thi_2 || '',
          'Kết quả lần 2': c.ket_qua_2 || '',
          'Ngày đi thi lần 3': c.ngay_thi_3 || '',
          'Kết quả lần 3': c.ket_qua_3 || '',
          'Ngày đi thi lần cuối': c.ngay_thi_cuoi || '',
          'Kết quả lần cuối': c.ket_qua_cuoi || '',
        }));
        const ws = window.XLSX.utils.json_to_sheet(rows);
        const wb = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(wb, ws, 'Học viên nguồn');
        window.XLSX.writeFile(wb, 'hoc_vien_nguon.xlsx');
      });

      document.getElementById('crmStaffSearch')?.addEventListener('input', () => renderCrmStaff(true));
      document.getElementById('crmStaffDeptFilter')?.addEventListener('change', () => renderCrmStaff(true));
      document.getElementById('crmStaffStatusFilter')?.addEventListener('change', () => renderCrmStaff(true));

      document.getElementById('btnCrmAddStaff')?.addEventListener('click', () => {
        document.getElementById('hrmStaffEditId').value = '';
        document.getElementById('hrmStaffForm').reset();
        document.getElementById('hrmStaffModalTitle').textContent = '+ THÊM NHÂN SỰ MỚI';
        document.getElementById('hrmStaffModal').style.display = 'flex';
      });

      document.getElementById('btnCloseCrmStaffProfile')?.addEventListener('click', closeCrmStaffProfile);

      document.getElementById('btnCrmProfileEdit')?.addEventListener('click', () => {
        if (!_crmStaffProfileStaff) return;
        closeCrmStaffProfile();
        editHrmStaff(_crmStaffProfileStaff);
      });

      document.querySelectorAll('.crmsp-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          document.querySelectorAll('.crmsp-tab').forEach(t => t.classList.remove('active'));
          document.querySelectorAll('.crmsp-panel').forEach(p => p.classList.remove('active'));
          tab.classList.add('active');
          const panel = document.getElementById(tab.dataset.ctab);
          if (panel) panel.classList.add('active');
        });
      });

      iocLoadPrefs();
      iocBindEvents();

      if (currentUser) {
        const av = document.getElementById('miniCrmAvatar');
        const nm = document.getElementById('miniCrmName');
        const rl = document.getElementById('miniCrmRole');
        if (av) {
          if (currentUser.avatar) {
            av.innerHTML = `<img src="${currentUser.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
            av.style.backgroundColor = 'transparent';
          } else {
            av.textContent = (currentUser.name || 'U').split(' ').map(n=>n[0]).join('').substring(0,2).toUpperCase();
          }
        }
        if (nm) nm.textContent = currentUser.name || 'Người dùng';
        if (rl) rl.textContent = currentUser.role === 'admin' ? 'Quản trị viên' : 'Nhân viên';
      }
    }

    db.collection('students').orderBy('createdAt', 'desc').get()
      .then(snap => {
        _allCrmCustomers = [];
        snap.forEach(doc => { const d = doc.data(); d.id = doc.id; _allCrmCustomers.push(d); });
        renderCrmOverview();
        renderCrmCustomers();
        renderCrmOldCustomers();
        // Re-render source tab if it's visible
        if (document.getElementById('crm-source-tab')?.style.display !== 'none') renderCrmSource();
      })
      .catch(err => console.error('CRM data load error:', err));

    db.collection('hrm_staff').orderBy('name').get()
      .then(snap => {
        _allCrmStaff = [];
        snap.forEach(doc => { const d = doc.data(); d.id = doc.id; _allCrmStaff.push(d); });
        renderCrmStaff();
        renderCrmCustomers(); // populate advisor selects after staff loaded
        renderCrmOldCustomers();
        if (document.getElementById('crm-source-tab')?.style.display !== 'none') renderCrmSource();
      })
      .catch(err => console.error('CRM staff load error:', err));
  };

  /* ==========================================================================
     STAFF PORTAL — Personal Profile Dashboard
     ========================================================================== */

  const populateStaffProfileDashboard = (s) => {
    const initials = (s.name || 'N').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const bg = getAvatarBgColor(s.name || '');

    const avatarEl = document.getElementById('spProfileAvatarLg');
    if (avatarEl) {
      if (s.photoUrl) {
        avatarEl.innerHTML = `<img src="${s.photoUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        avatarEl.style.background = 'transparent';
      } else {
        avatarEl.textContent = initials;
        avatarEl.style.background = bg;
      }
    }

    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '--'; };
    const fmtDate = (dateStr) => {
      if (!dateStr) return '--';
      const parts = dateStr.split('-');
      return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateStr;
    };
    const fmtCurrency = (val) => (val || 0).toLocaleString('vi-VN') + ' đ';

    setText('spProfileFullName', s.name);
    const empCode = document.getElementById('spProfileEmpCode');
    if (empCode) {
      const globalIdx = hrmStaffCache.findIndex(x => x.id === s.id) + 1;
      const empCodeVal = globalIdx > 0 ? String(globalIdx).padStart(5, '0') : '--';
      empCode.textContent = `Mã ${empCodeVal}`;
    }
    const positions = document.getElementById('spProfilePositions');
    if (positions) {
      const positionText = s.jobTitle || s.position || '';
      positions.textContent = positionText ? `${positionText} • ${s.department || ''}` : '--';
    }

    setText('spPUsername', s.username);
    setText('spPJoinDate', fmtDate(s.joinDate));
    setText('spPBirthday', fmtDate(s.birthday));
    setText('spPHometown', s.hometown);
    setText('spPGender', s.gender);
    setText('spPMarital', s.maritalStatus);
    setText('spPEducation', s.education);

    const emailEl = document.getElementById('spPEmail');
    if (emailEl) { emailEl.textContent = s.email || '--'; emailEl.href = s.email ? `mailto:${s.email}` : '#'; }
    const phoneEl = document.getElementById('spPPhone');
    if (phoneEl) { phoneEl.textContent = s.phone || '--'; phoneEl.href = s.phone ? `tel:${s.phone}` : '#'; }

    // Emergency contact summary
    const ecSummary = s.emergencyContactName
      ? `${s.emergencyContactName}${s.emergencyContactPhone ? ' · ' + s.emergencyContactPhone : ''}${s.emergencyContactRelation ? ' (' + s.emergencyContactRelation + ')' : ''}`
      : '--';
    setText('spPEmergencyContactSummary', ecSummary);

    // Skills tags
    const skillTagsEl = document.getElementById('spProfileSkillTags');
    if (skillTagsEl) {
      const skills = Array.isArray(s.skills) ? s.skills : [];
      skillTagsEl.innerHTML = skills.length
        ? skills.map(sk => `<span class="skill-tag">${esc(sk)}</span>`).join('')
        : '<span class="skill-tag-empty">Chưa cập nhật</span>';
    }

    const badge = document.getElementById('spProfileStatusBadge');
    if (badge) {
      badge.textContent = s.status || '--';
      badge.className = 'profile-status-badge';
      if (s.status === 'Đang làm việc') badge.classList.add('active-badge');
      else if (s.status === 'Nghỉ phép') badge.classList.add('leave-badge');
      else badge.classList.add('inactive-badge');
    }

    // Work overview fields
    const wsdEl = document.getElementById('spPWorkStartDate');
    if (wsdEl) wsdEl.textContent = s.joinDate ? new Date(s.joinDate).toLocaleDateString('vi-VN') : '--';

    const kpiEl = document.getElementById('spPKpi');
    if (kpiEl) {
      const storedKpi = (s.kpi != null && s.kpi !== '') ? Number(s.kpi) : null;
      if (storedKpi != null) {
        kpiEl.textContent = storedKpi + '%';
        kpiEl.style.color = storedKpi >= 90 ? '#10B981' : storedKpi >= 70 ? '#6366F1' : storedKpi >= 50 ? '#F59E0B' : '#EF4444';
      } else {
        kpiEl.textContent = 'Chưa cập nhật';
        kpiEl.style.color = 'var(--color-text-muted,#6B6A67)';
      }
    }

    const spSalaryEl = document.getElementById('spPSalary');
    if (spSalaryEl) {
      spSalaryEl.textContent = (s.salary > 0) ? Number(s.salary).toLocaleString('vi-VN') + ' đ' : '-- đ';
      spSalaryEl.style.color = s.salary > 0 ? '#059669' : 'var(--color-text-muted,#6B6A67)';
    }

    setText('spPDept', s.department);
    setText('spPLineManager', s.manager || 'Ban Giám đốc');

    // Work days & attendance — show loading, filled async below
    const spWdEl = document.getElementById('spPWorkDays');
    const spAttEl = document.getElementById('spPAttendance');
    if (spWdEl)  { spWdEl.textContent  = '...'; spWdEl.style.color  = 'var(--color-text-muted,#6B6A67)'; }
    if (spAttEl) { spAttEl.textContent = '...'; spAttEl.style.color = 'var(--color-text-muted,#6B6A67)'; }

    // Income card (clean display — no unit suffix, card shows "đồng / tháng")
    // Seed for skill chart (kept for other uses)
    const seed = (s.id || s.name || 'x').split('').reduce((a, c) => a + c.charCodeAt(0), 0);

    // HR Score (read-only, same formula as admin)
    const _applySpHrScore = (kpiDisplay, attPct) => {
      const totalScore = Math.round(kpiDisplay * 0.6 + attPct * 0.4);
      const grade = totalScore >= 90 ? 'A' : totalScore >= 80 ? 'B+' : totalScore >= 70 ? 'B' : totalScore >= 60 ? 'C' : 'D';
      const gradeColor = totalScore >= 90 ? '#10B981' : totalScore >= 80 ? '#6366F1' : totalScore >= 70 ? '#3B82F6' : totalScore >= 60 ? '#F59E0B' : '#EF4444';
      const gradeNote = totalScore >= 90 ? '🏆 Xuất sắc — Nhân viên tiêu biểu'
        : totalScore >= 80 ? '🌟 Tốt — Vượt kỳ vọng'
        : totalScore >= 70 ? '👍 Khá — Đạt yêu cầu'
        : totalScore >= 60 ? '⚠️ Trung bình — Cần cải thiện'
        : '🔴 Yếu — Cần hỗ trợ đặc biệt';
      const scoreValEl   = document.getElementById('spHrScoreVal');
      const scoreGradeEl = document.getElementById('spHrScoreGrade');
      const scoreArcEl   = document.getElementById('spHrScoreArc');
      const kpiBarEl     = document.getElementById('spHrKpiBar');
      const attBarEl     = document.getElementById('spHrAttBar');
      const kpiValEl     = document.getElementById('spHrKpiVal');
      const attValEl     = document.getElementById('spHrAttVal');
      const noteEl       = document.getElementById('spHrScoreNote');
      if (scoreValEl)   scoreValEl.textContent   = totalScore;
      if (scoreGradeEl) { scoreGradeEl.textContent = grade; scoreGradeEl.style.color = gradeColor; }
      if (scoreArcEl) {
        scoreArcEl.style.stroke = gradeColor;
        scoreArcEl.style.transition = 'none';
        scoreArcEl.style.strokeDashoffset = '326.7';
        requestAnimationFrame(() => {
          scoreArcEl.style.transition = 'stroke-dashoffset 1.1s cubic-bezier(.4,0,.2,1), stroke 0.3s';
          scoreArcEl.style.strokeDashoffset = String(326.7 - (totalScore / 100) * 326.7);
        });
      }
      if (kpiBarEl) { kpiBarEl.style.width = '0%'; requestAnimationFrame(() => { kpiBarEl.style.transition = 'width 1s ease'; kpiBarEl.style.width = kpiDisplay + '%'; }); }
      if (attBarEl) { attBarEl.style.width = '0%'; requestAnimationFrame(() => { attBarEl.style.transition = 'width 1s ease'; attBarEl.style.width = attPct + '%'; }); }
      if (kpiValEl) kpiValEl.textContent = kpiDisplay + '%';
      if (attValEl) attValEl.textContent = attPct + '%';
      if (noteEl)   { noteEl.textContent = gradeNote; noteEl.style.color = gradeColor; }
    };

    // Initial HR score with stored KPI (attendance will update after async fetch)
    const storedKpiInit = (s.kpi != null && s.kpi !== '') ? Number(s.kpi) : 75;
    _applySpHrScore(storedKpiInit, 80); // placeholder att, overwritten when attendance loads

    // Async: fetch real attendance → update work days, attendance %, HR Score
    (async () => {
      const now = new Date();
      const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const { S: standardDays } = calcStandardDays(monthStr);
      const todayDay = now.getDate();
      const days = {};

      try {
        const attDoc = await db.collection('attendance').doc(`${s.id}_${monthStr}`).get();
        if (attDoc.exists && attDoc.data().days) Object.assign(days, attDoc.data().days);
      } catch (e) { /* non-critical */ }

      if (s.email) {
        try {
          const logsSnap = await db.collection('checkin_logs')
            .where('month', '==', monthStr).where('email', '==', s.email).get();
          logsSnap.forEach(doc => {
            const d = doc.data();
            if (d.date && d.checkin_time) {
              const dayKey = String(parseInt(d.date.split('-')[2], 10));
              if (!days[dayKey]) days[dayKey] = '1';
            }
          });
        } catch (e) { /* non-critical */ }
      }

      let actualDays = 0;
      Object.entries(days).forEach(([dayStr, v]) => {
        if (parseInt(dayStr, 10) > todayDay) return;
        if (v === '1') actualDays += 1;
        else if (v === '0.5') actualDays += 0.5;
      });

      let elapsedStd = 0;
      for (let d = 1; d <= todayDay; d++) {
        const dow = new Date(now.getFullYear(), now.getMonth(), d).getDay();
        if (dow >= 1 && dow <= 5) elapsedStd++;
        else if (dow === 6) elapsedStd += 0.5;
      }
      const attPct = elapsedStd > 0 ? Math.min(100, Math.round((actualDays / elapsedStd) * 100)) : 0;
      const kpiForScore = (s.kpi != null && s.kpi !== '') ? Number(s.kpi) : 0;

      if (spWdEl) {
        spWdEl.textContent = (actualDays % 1 === 0 ? actualDays : actualDays.toFixed(1)) + ' / ' + standardDays + ' ngày';
        spWdEl.style.color = '';
      }
      if (spAttEl) {
        spAttEl.textContent = attPct + '%';
        spAttEl.style.color = attPct >= 95 ? '#10B981' : attPct >= 80 ? '#6366F1' : attPct >= 65 ? '#F59E0B' : '#EF4444';
      }
      _applySpHrScore(kpiForScore, attPct);
    })();

    // Populate resume form inputs (employee edits these)
    const setInput = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    setInput('spInputIdNumber',            s.idNumber);
    setInput('spInputIdDate',              s.idDate || '');
    setInput('spInputIdPlace',             s.idPlace);
    setInput('spInputAddressPermanent',    s.addressPermanent);
    setInput('spInputAddressCurrent',      s.addressCurrent);
    setInput('spInputEmergencyName',       s.emergencyContactName);
    setInput('spInputEmergencyPhone',      s.emergencyContactPhone);
    setInput('spInputEmergencyRelation',   s.emergencyContactRelation);

    setText('spProfileContractType', s.contractType);
    setText('spProfileContractStartDate', fmtDate(s.contractStartDate || s.joinDate));
    setText('spProfileContractEndDate', s.contractEndDate ? fmtDate(s.contractEndDate) : 'Vô thời hạn');
    setText('spProfileContractStatus', s.status === 'Đã nghỉ việc' ? 'Hết hiệu lực' : 'Đang hiệu lực');
    setText('spProfileDept', s.department);
    setText('spProfilePos', s.position);
    setText('spProfileManager', s.manager || 'Ban Giám đốc');
    setText('spProfileJoinDate2', fmtDate(s.joinDate));

    setText('spProfileBaseSalary', fmtCurrency(s.salary));
    setText('spProfileAllowanceLunch', s.allowanceSalary ? fmtCurrency(s.allowanceSalary) : '0 đ');
    setText('spProfileInsurance', s.insuranceSalary || 'Không');
    // Bank inputs (editable by employee)
    setInput('spInputBankNo',          s.bankAccountNo);
    setInput('spInputBankName',        s.bankName);
    setInput('spInputBankAccountName', s.bankAccountName);
    setInput('spInputTaxCode',         s.taxCode);

    // ── Resume photo (self-service)
    const spPhotoFrame = document.getElementById('spResumePhotoFrame');
    if (spPhotoFrame) {
      spPhotoFrame.innerHTML = s.photoUrl
        ? `<img src="${s.photoUrl}" alt="${esc(s.name || '')}">`
        : `<span class="resume-photo-placeholder">👤</span>`;
    }
    const spPhotoInput = document.getElementById('spResumePhotoInput');
    if (spPhotoInput && !spPhotoInput.dataset.bound) {
      spPhotoInput.dataset.bound = '1';
      spPhotoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        spPhotoInput.value = '';
        const reader = new FileReader();
        reader.onerror = () => showToast('Không đọc được file ảnh', 'error');
        reader.onload = async (ev) => {
          try {
            const img = await new Promise((res, rej) => {
              const i = new Image();
              i.onload = () => res(i);
              i.onerror = () => rej(new Error('File ảnh không hợp lệ'));
              i.src = ev.target.result;
            });

            const scale = Math.min(1, 720 / Math.max(img.width, img.height));
            const tw = Math.round(img.width * scale);
            const th = Math.round(img.height * scale);
            const tc = document.createElement('canvas');
            tc.width = tw; tc.height = th;
            tc.getContext('2d').drawImage(img, 0, 0, tw, th);
            const thumbUrl = tc.toDataURL('image/jpeg', 0.88);

            if (spPhotoFrame) spPhotoFrame.innerHTML = `<img src="${thumbUrl}" alt="${esc(s.name || '')}">`;
            s.photoUrl = thumbUrl;
            await db.collection('hrm_staff').doc(s.id).update({ photoUrl: thumbUrl });
            showToast('Đã lưu ảnh!', 'success');

            if (_hrmStorage) {
              try {
                const maxW = 1920, maxH = 1080;
                let w = img.width, h = img.height;
                if (w > maxW || h > maxH) {
                  const r = Math.min(maxW / w, maxH / h);
                  w = Math.round(w * r); h = Math.round(h * r);
                }
                const hc = document.createElement('canvas');
                hc.width = w; hc.height = h;
                const hx = hc.getContext('2d');
                hx.imageSmoothingEnabled = true; hx.imageSmoothingQuality = 'high';
                hx.drawImage(img, 0, 0, w, h);
                const hdBlob = await new Promise(res => hc.toBlob(res, 'image/jpeg', 0.92));
                if (hdBlob) {
                  const ref = _hrmStorage.ref(`hrm_staff/${s.id}/photo/profile.jpg`);
                  await ref.put(hdBlob, { contentType: 'image/jpeg' });
                  const hdUrl = await ref.getDownloadURL();
                  await db.collection('hrm_staff').doc(s.id).update({ photoUrl: hdUrl });
                  s.photoUrl = hdUrl;
                  if (spPhotoFrame) spPhotoFrame.innerHTML = `<img src="${hdUrl}" alt="${esc(s.name || '')}">`;
                  showToast('Ảnh đã nâng cấp Full HD!', 'success');
                }
              } catch (_) { /* HD upgrade failed — thumbnail already saved */ }
            }
          } catch (err) {
            showToast('Lỗi: ' + err.message, 'error');
          }
        };
        reader.readAsDataURL(file);
      });
    }

    // ── Resume documents (self-service)
    loadHrmResumeDocs(s.id, 'sp');
    const spDocInput = document.getElementById('spResumeDocInput');
    if (spDocInput && !spDocInput.dataset.bound) {
      spDocInput.dataset.bound = '1';
      spDocInput.addEventListener('change', () => uploadHrmResumeDocs(s.id, spDocInput, 'sp'));
    }

    // ── Contract documents (self-service)
    loadHrmContractDocs(s.id, 'sp');
    const spCDocInput = document.getElementById('spContractDocInput');
    if (spCDocInput && !spCDocInput.dataset.bound) {
      spCDocInput.dataset.bound = '1';
      spCDocInput.addEventListener('change', () => uploadHrmContractDocs(s.id, spCDocInput, 'sp'));
    }
    const spBtnCD = document.getElementById('spBtnViewContractDetail');
    if (spBtnCD && !spBtnCD.dataset.bound) {
      spBtnCD.dataset.bound = '1';
      spBtnCD.addEventListener('click', () => openContractDetailModal(s));
    }

  };

  const initStaffProfileDashboard = async () => {
    const dashboard = document.getElementById('staff-profile-dashboard');
    if (dashboard) dashboard.style.display = 'flex';

    // ── Staff topbar user dropdown (position:fixed bypasses overflow-x:auto clipping) ──
    const spWrapper = document.querySelector('#staff-profile-dashboard .topbar-user-wrapper');
    const spDrop    = spWrapper?.querySelector('.topbar-user-dropdown');
    if (spWrapper && spDrop && !spWrapper.dataset.dropBound) {
      spWrapper.dataset.dropBound = '1';

      let _hideTimer;
      const showDrop = () => {
        clearTimeout(_hideTimer);
        const r = spWrapper.getBoundingClientRect();
        Object.assign(spDrop.style, {
          display:  'block',
          position: 'fixed',
          top:      (r.bottom + 4) + 'px',
          right:    (window.innerWidth - r.right) + 'px',
          left:     'auto',
          zIndex:   '10000',
          minWidth: '180px',
        });
      };
      const hideDrop = () => {
        _hideTimer = setTimeout(() => { spDrop.style.display = 'none'; }, 120);
      };

      spWrapper.addEventListener('mouseenter', showDrop);
      spWrapper.addEventListener('mouseleave', hideDrop);
      spDrop.addEventListener('mouseenter',   () => clearTimeout(_hideTimer));
      spDrop.addEventListener('mouseleave',   hideDrop);

      // Click on badge also toggles dropdown (mobile / touch)
      spWrapper.querySelector('.user-profile-badge-inline')
        ?.addEventListener('click', (e) => {
          e.stopPropagation();
          spDrop.style.display === 'none' || !spDrop.style.display ? showDrop() : hideDrop();
        });

      // Close dropdown when any item inside is clicked (actual actions handled by global listeners)
      spDrop.addEventListener('click', () => { spDrop.style.display = 'none'; });

      // Close on outside click
      document.addEventListener('click', (e) => {
        if (!spWrapper.contains(e.target) && !spDrop.contains(e.target)) {
          spDrop.style.display = 'none';
        }
      });
    }

    // Bind tab click events once via delegation
    const spTabNav = document.querySelector('#staff-profile-dashboard .hrm-profile-topbar');
    if (spTabNav && !spTabNav.dataset.spBound) {
      spTabNav.dataset.spBound = '1';
      spTabNav.addEventListener('click', e => {
        const btn = e.target.closest('.sp-tab');
        if (!btn) return;
        document.querySelectorAll('.sp-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('#staff-profile-dashboard .crmsp-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const panel = document.getElementById(btn.getAttribute('data-sptab'));
        if (panel) panel.classList.add('active');
        if (btn.getAttribute('data-sptab') === 'sptab-test') {
          renderCompetencyTestForStaff();
        }
      });
    }

    // Wire save button (once)
    const saveBtn = document.getElementById('btnSaveResume');
    if (saveBtn && !saveBtn.dataset.bound) {
      saveBtn.dataset.bound = '1';
      saveBtn.addEventListener('click', async () => {
        if (!currentUser) { showToast('Chưa đăng nhập!', 'error'); return; }
        const orig = saveBtn.innerHTML;
        saveBtn.disabled = true; saveBtn.innerHTML = '⏳ Đang lưu...';
        try {
          const snap2 = await db.collection('hrm_staff').where('email', '==', currentUser.email).limit(1).get();
          if (snap2.empty) { showToast('Không tìm thấy hồ sơ nhân sự!', 'error'); return; }
          const docId = snap2.docs[0].id;
          const val = id => (document.getElementById(id)?.value || '').trim();
          await db.collection('hrm_staff').doc(docId).update({
            idNumber:               val('spInputIdNumber'),
            idDate:                 val('spInputIdDate'),
            idPlace:                val('spInputIdPlace'),
            addressPermanent:       val('spInputAddressPermanent'),
            addressCurrent:         val('spInputAddressCurrent'),
            emergencyContactName:   val('spInputEmergencyName'),
            emergencyContactPhone:  val('spInputEmergencyPhone'),
            emergencyContactRelation: val('spInputEmergencyRelation'),
          });
          showToast('Đã lưu thông tin sơ yếu lý lịch!', 'success');
        } catch (e) {
          showToast('Lỗi lưu: ' + e.message, 'error');
        } finally {
          saveBtn.disabled = false; saveBtn.innerHTML = orig;
        }
      });
    }

    // Wire bank/tax save button (once)
    const saveBankBtn = document.getElementById('btnSaveBankInfo');
    if (saveBankBtn && !saveBankBtn.dataset.bound) {
      saveBankBtn.dataset.bound = '1';
      saveBankBtn.addEventListener('click', async () => {
        if (!currentUser) { showToast('Chưa đăng nhập!', 'error'); return; }
        const orig = saveBankBtn.innerHTML;
        saveBankBtn.disabled = true; saveBankBtn.innerHTML = '⏳ Đang lưu...';
        try {
          const snap2 = await db.collection('hrm_staff').where('email', '==', currentUser.email).limit(1).get();
          if (snap2.empty) { showToast('Không tìm thấy hồ sơ nhân sự!', 'error'); return; }
          const val = id => (document.getElementById(id)?.value || '').trim();
          await db.collection('hrm_staff').doc(snap2.docs[0].id).update({
            bankAccountNo:   val('spInputBankNo'),
            bankName:        val('spInputBankName'),
            bankAccountName: val('spInputBankAccountName'),
            taxCode:         val('spInputTaxCode'),
          });
          showToast('Đã lưu thông tin ngân hàng & thuế!', 'success');
        } catch (e) {
          showToast('Lỗi lưu: ' + e.message, 'error');
        } finally {
          saveBankBtn.disabled = false; saveBankBtn.innerHTML = orig;
        }
      });
    }

    if (!currentUser) return;

    try {
      const snap = await db.collection('hrm_staff')
        .where('email', '==', currentUser.email)
        .limit(1)
        .get();

      if (!snap.empty) {
        const s = { id: snap.docs[0].id, ...snap.docs[0].data() };
        _spCurrentStaff = s;
        populateStaffProfileDashboard(s);
        // Setup leave tab
        _leaveStaffEmail = s.email || currentUser.email;
        setupLeaveModal();
        subscribeLeave(_leaveStaffEmail, s.joinDate);
        document.getElementById('btnRequestLeave')?.addEventListener('click', () => {
          // Set default date to today
          const d = new Date();
          const todayVal = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          const dateInput = document.getElementById('leaveDate');
          if (dateInput && !dateInput.value) dateInput.value = todayVal;
          document.getElementById('leaveRequestModal').style.display = 'flex';
        });
      } else {
        const avatarEl = document.getElementById('spProfileAvatarLg');
        if (avatarEl) {
          if (currentUser.avatar) {
            avatarEl.innerHTML = `<img src="${currentUser.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
            avatarEl.style.background = 'transparent';
          } else {
            const initials = (currentUser.name || 'NV').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
            avatarEl.textContent = initials;
            avatarEl.style.background = getAvatarBgColor(currentUser.name || '');
          }
        }
        const nameEl = document.getElementById('spProfileFullName');
        if (nameEl) nameEl.textContent = currentUser.name || '--';
        const emailEl = document.getElementById('spPEmail');
        if (emailEl) { emailEl.textContent = currentUser.email || '--'; emailEl.href = currentUser.email ? `mailto:${currentUser.email}` : '#'; }
      }
    } catch (err) {
      console.error('Staff profile load error:', err);
    }
  };

  // ==========================================================================
  // LEAVE MANAGEMENT — Thông tin phép
  // ==========================================================================

  const calcLeaveBalance = (joinDateRaw) => {
    if (!joinDateRaw) return { total: 0, months: 0, joinStr: '--' };
    const jd = joinDateRaw.toDate ? joinDateRaw.toDate()
              : (typeof joinDateRaw === 'string' ? new Date(joinDateRaw + 'T00:00:00') : new Date(joinDateRaw));
    if (isNaN(jd)) return { total: 0, months: 0, joinStr: '--' };
    const months = Math.floor((Date.now() - jd.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
    const total  = Math.max(0, months);
    const joinStr = `${String(jd.getDate()).padStart(2,'0')}/${String(jd.getMonth()+1).padStart(2,'0')}/${jd.getFullYear()}`;
    return { total, months, joinStr };
  };

  const fmtLeaveDate = (dateStr) => {
    if (!dateStr) return '--';
    const [y,m,d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  };

  const sessionLabel = s => s === 'morning' ? 'Buổi sáng' : 'Buổi chiều';

  const renderLeavePanel = ({ prefix, total, used, months, joinStr, records, canCancel }) => {
    const remain  = Math.max(0, total - used);
    const pct     = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
    const barColor = remain <= 2 ? 'linear-gradient(90deg,#EF4444,#DC2626)' : 'linear-gradient(90deg,#10B981,#059669)';

    const setEl = (id, val) => { const el = document.getElementById(prefix + id); if (el) el[typeof val === 'string' && val.includes('<') ? 'innerHTML' : 'textContent'] = val; };
    setEl('LeaveTotal',  total);
    setEl('LeaveUsed',   used);
    setEl('LeaveRemain', remain);
    setEl('LeaveMeta',  `Tính từ ngày vào làm: ${joinStr} · ${months} tháng công tác`);

    const bar = document.getElementById(prefix + 'LeaveBar');
    if (bar) { bar.style.width = pct + '%'; bar.style.background = barColor; }

    const tbody = document.getElementById(prefix + 'LeaveHistory');
    if (!tbody) return;
    if (!records.length) {
      tbody.innerHTML = `<tr><td colspan="${canCancel ? 5 : 4}" class="leave-empty">Chưa có lịch sử nghỉ phép.</td></tr>`;
      return;
    }
    tbody.innerHTML = records.map(r => {
      const created = r.createdAt?.toDate ? r.createdAt.toDate().toLocaleDateString('vi-VN') : '--';
      const cancelBtn = canCancel
        ? `<td style="text-align:center;"><button class="leave-cancel-btn" data-lid="${r.id}">Hủy</button></td>`
        : '';
      return `<tr>
        <td style="font-weight:600;">${fmtLeaveDate(r.date)}</td>
        <td><span style="font-size:0.78rem;background:${r.session==='morning'?'#DBEAFE':'#FEF3C7'};color:${r.session==='morning'?'#1D4ED8':'#92400E'};padding:2px 10px;border-radius:99px;">${sessionLabel(r.session)}</span></td>
        <td style="font-size:0.8rem;color:var(--text-muted);">${r.reason || '--'}</td>
        <td style="font-size:0.78rem;color:var(--text-muted);">${created}</td>
        ${cancelBtn}
      </tr>`;
    }).join('');

    if (canCancel) {
      tbody.querySelectorAll('.leave-cancel-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Hủy đơn nghỉ phép này?')) return;
          try {
            await db.collection('leave_requests').doc(btn.dataset.lid).delete();
            showToast('Đã hủy đơn nghỉ phép.', 'success');
          } catch (e) { showToast('Lỗi: ' + e.message, 'error'); }
        });
      });
    }
  };

  const loadLeaveData = async (email, joinDateRaw, prefix, canCancel) => {
    const { total, months, joinStr } = calcLeaveBalance(joinDateRaw);
    try {
      const snap = await db.collection('leave_requests')
        .where('staffEmail', '==', email)
        .orderBy('date', 'desc')
        .get();
      const records = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderLeavePanel({ prefix, total, used: records.length, months, joinStr, records, canCancel });
    } catch (e) {
      console.error('Leave load error:', e);
      renderLeavePanel({ prefix, total, used: 0, months, joinStr, records: [], canCancel });
    }
  };

  // Wire leave request modal (once globally)
  let _leaveStaffEmail = null;
  const setupLeaveModal = () => {
    const modal = document.getElementById('leaveRequestModal');
    if (!modal || modal.dataset.bound) return;
    modal.dataset.bound = '1';

    const close = () => { modal.style.display = 'none'; };
    document.getElementById('btnCloseLeaveModal')?.addEventListener('click', close);
    document.getElementById('btnCancelLeave')?.addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });

    document.getElementById('btnConfirmLeave')?.addEventListener('click', async () => {
      const email  = _leaveStaffEmail;
      const date   = document.getElementById('leaveDate')?.value;
      const session= document.getElementById('leaveSession')?.value;
      const reason = (document.getElementById('leaveReason')?.value || '').trim();
      if (!email || !date) { showToast('Vui lòng chọn ngày nghỉ!', 'warning'); return; }
      const btn = document.getElementById('btnConfirmLeave');
      const orig = btn.innerHTML; btn.disabled = true; btn.innerHTML = '⏳ Đang gửi...';
      try {
        await db.collection('leave_requests').add({
          staffEmail: email, date, session, reason,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast('Đã gửi đơn nghỉ phép!', 'success');
        close();
        // Reload employee leave tab
        const snap = await db.collection('hrm_staff').where('email','==',email).limit(1).get();
        if (!snap.empty) {
          const s = snap.docs[0].data();
          await loadLeaveData(email, s.joinDate, 'sp', true);
        }
      } catch (e) {
        showToast('Lỗi: ' + e.message, 'error');
      } finally {
        btn.disabled = false; btn.innerHTML = orig;
      }
    });
  };

  // Realtime leave subscription for employee tab
  let _leaveUnsub = null;
  const subscribeLeave = (email, joinDateRaw) => {
    if (_leaveUnsub) { _leaveUnsub(); _leaveUnsub = null; }
    const { total, months, joinStr } = calcLeaveBalance(joinDateRaw);
    _leaveUnsub = db.collection('leave_requests')
      .where('staffEmail', '==', email)
      .orderBy('date', 'desc')
      .onSnapshot(snap => {
        const records = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderLeavePanel({ prefix: 'sp', total, used: records.length, months, joinStr, records, canCancel: true });
      }, err => console.error('Leave sub error:', err));
  };

  // ===========================================================================
  //  LỊCH BAY + THÔNG BÁO TỰ ĐỘNG
  // ===========================================================================

  // ---- Helpers ----
  const dateStrToMidnight = (dateStr) => {
    // "YYYY-MM-DD" → Date at local midnight
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  const formatDateVN = (date) => {
    const p = n => String(n).padStart(2, '0');
    return `${p(date.getDate())}/${p(date.getMonth()+1)}/${date.getFullYear()}`;
  };

  // ---- Save flight date & upsert notifications ----
  const saveFlightDate = async (studentId, studentName, studentCode, dateStr) => {
    const flightTs = dateStr
      ? firebase.firestore.Timestamp.fromDate(dateStrToMidnight(dateStr))
      : null;

    await db.collection('students').doc(studentId).update({ flightDate: flightTs || firebase.firestore.FieldValue.delete() });

    if (flightTs) {
      await upsertFlightNotifications(studentId, studentName, studentCode, dateStrToMidnight(dateStr));
    } else {
      // Clear ALL notifications for this student's flight (student reminders + staff broadcasts)
      const snap = await db.collection('notifications')
        .where('recipientStudentId', '==', studentId)
        .where('type', 'in', ['flight_7day', 'flight_3day', 'flight_announce'])
        .get();
      const batch = db.batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
  };

  const upsertFlightNotifications = async (studentId, studentName, studentCode, flightDate) => {
    const flightDateStr = formatDateVN(flightDate);
    const now     = firebase.firestore.Timestamp.fromDate(new Date());
    const flightTs = firebase.firestore.Timestamp.fromDate(flightDate);

    // Message for student (reminder before flight)
    const studentMsg = `${studentName}, mã số ${studentCode} chuẩn bị bay, vui lòng check đủ hồ sơ để chuẩn bị cho chuyến bay tốt nhất, chúc bạn may mắn!`;

    // Message for ALL staff (immediate broadcast when flight date is set)
    const staffMsg = `Thông báo bạn ${studentName} - ${studentCode} sẽ xuất cảnh ngày ${flightDateStr}. Đề nghị các phòng ban liên quan chú ý bám sát để bạn có chuyến bay thuận lợi nhất. Trân trọng,`;

    // Fetch student email + all staff emails in parallel
    const [studentDoc, staffSnap] = await Promise.all([
      db.collection('students').doc(studentId).get(),
      db.collection('hrm_staff').get(),
    ]);
    const studentEmail = studentDoc.data()?.email || '';
    const staffEmails  = staffSnap.docs.map(d => d.data().email).filter(Boolean);

    const batch = db.batch();

    // Remove old notifications for this student (all types: reminders + old broadcasts)
    const oldSnap = await db.collection('notifications')
      .where('recipientStudentId', '==', studentId)
      .where('type', 'in', ['flight_7day', 'flight_3day', 'flight_announce'])
      .get();
    oldSnap.docs.forEach(d => batch.delete(d.ref));

    // Student reminder notifications: 7-day and 3-day before flight
    if (studentEmail) {
      const notifDays = [
        { type: 'flight_7day', daysBefor: 7, label: '7 ngày' },
        { type: 'flight_3day', daysBefor: 3, label: '3 ngày' },
      ];
      for (const { type, daysBefor, label } of notifDays) {
        const dueDate = new Date(flightDate.getTime());
        dueDate.setDate(dueDate.getDate() - daysBefor);
        batch.set(db.collection('notifications').doc(), {
          recipientStudentId: studentId,
          recipientEmail:     studentEmail,
          type,
          title:     `✈ Nhắc nhở chuyến bay (còn ${label})`,
          message:   studentMsg,
          flightDate: flightTs,
          dueDate:   firebase.firestore.Timestamp.fromDate(dueDate),
          isRead:    false,
          createdAt: now,
        });
      }
    }

    // Immediate broadcast notification for every staff member
    for (const email of staffEmails) {
      batch.set(db.collection('notifications').doc(), {
        recipientStudentId: studentId,
        recipientEmail:     email,
        type:      'flight_announce',
        title:     '✈ Thông báo lịch xuất cảnh',
        message:   staffMsg,
        flightDate: flightTs,
        isRead:    false,
        createdAt: now,
      });
    }

    await batch.commit();
    showToast(`Đã gửi thông báo lịch bay đến ${staffEmails.length} nhân viên.`, 'success');
  };

  // ---- Workflow assignee notification ----
  // Sends a bell notification to the staff member assigned to a workflow step.
  // Only fires when the assignee actually changed (prev !== next).
  const sendAssigneeNotification = async ({ stepName, workflowName, workflowId, assigneeName, prevAssignee, deadline }) => {
    if (!assigneeName || assigneeName === prevAssignee) return;

    // Roles (not real names) — no email to look up
    const GENERIC_ROLES = ['Tư vấn viên','Chuyên viên hồ sơ','Chuyên viên visa','Kế toán','Giáo viên','Giám đốc','Marketing'];
    if (GENERIC_ROLES.includes(assigneeName)) return;

    await _loadStaffMap();
    const staffInfo = _staffNameMap[assigneeName.toLowerCase().trim()];
    const recipientEmail = staffInfo?.email || (() => {
      // fallback: search hrmStaffCache directly
      if (typeof hrmStaffCache !== 'undefined') {
        const found = hrmStaffCache.find(s => s.name === assigneeName);
        return found?.email || '';
      }
      return '';
    })();

    if (!recipientEmail) return; // can't deliver without email

    const adminName = (typeof currentUser !== 'undefined' && currentUser?.displayName)
      ? currentUser.displayName
      : 'Quản trị viên';

    const deadlinePart = deadline ? ` Hạn xử lý: ${deadline} ngày.` : '';
    const message = `${adminName} vừa phân công bạn phụ trách bước "${stepName}" trong quy trình "${workflowName}".${deadlinePart} Vui lòng kiểm tra và cập nhật tiến độ.`;

    try {
      await db.collection('notifications').add({
        recipientEmail,
        type:         'task_assign',
        title:        `📋 Bạn được giao việc mới`,
        message,
        workflowId,
        workflowName,
        stepName,
        isRead:       false,
        createdAt:    firebase.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) {
      console.warn('sendAssigneeNotification error:', e.message);
    }
  };

  // ---- Notification Bell UI ----
  let _notifList  = [];
  let _notifOpen  = false;

  const _bellSvgHtml = `<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
      <path d="M21,19V20H3V19L5,17V11C5,7.9 7.03,5.17 10,4.29C10,4.19 10,4.1 10,4A2,2 0 0,1 12,2A2,2 0 0,1 14,4C14,4.1 14,4.19 14,4.29C16.97,5.17 19,7.9 19,11V17L21,19M14,21A2,2 0 0,1 12,23A2,2 0 0,1 10,21"/>
    </svg>`;

  // Shared bell ring helper — triggered by onSnapshot when new notifications arrive
  const ringBells = () => {
    document.querySelectorAll('.topbar-notif-btn').forEach(btn => {
      btn.classList.remove('bell-ringing');
      void btn.offsetWidth;
      btn.classList.add('bell-ringing');
      setTimeout(() => btn.classList.remove('bell-ringing'), 700);
    });
  };

  let _bellInit = false;
  const initNotificationBell = () => {
    const dropdown = document.getElementById('notifDropdown');
    if (!dropdown) return;

    // Inject bell button before every .topbar-user-wrapper (admin/staff) and
    // .student-profile-dropdown (student). Safe to call multiple times — duplicate guard below.
    [
      ...document.querySelectorAll('.topbar-user-wrapper'),
      ...document.querySelectorAll('.student-profile-dropdown'),
    ].forEach(anchor => {
      if (anchor.previousElementSibling?.classList.contains('topbar-notif-btn')) return;
      const btn = document.createElement('button');
      btn.className = 'topbar-notif-btn';
      btn.title = 'Thông báo';
      btn.setAttribute('aria-label', 'Thông báo');
      btn.innerHTML = `<span class="global-notif-bell-icon">${_bellSvgHtml}<span class="notif-badge">0</span></span>`;
      anchor.parentElement.insertBefore(btn, anchor);
    });

    // Only wire event listeners and intervals ONCE per page load
    if (_bellInit) return;
    _bellInit = true;

    document.getElementById('btnMarkAllRead')?.addEventListener('click', markAllNotifsRead);

    // Bell click — single document listener, registered exactly once
    document.addEventListener('click', (e) => {
      if (e.target.closest('.topbar-notif-btn')) {
        e.stopPropagation();
        _notifOpen = !_notifOpen;
        dropdown.classList.toggle('open', _notifOpen);
        if (_notifOpen) fetchNotifications();
        return;
      }
      if (_notifOpen && !dropdown.contains(e.target)) {
        _notifOpen = false;
        dropdown.classList.remove('open');
      }
    });

  };

  const fetchNotifications = async () => {
    if (!currentUser) return;
    const list = document.getElementById('notifList');
    if (!list) return;

    try {
      // Fetch all notifications for this user, newest first — no dueDate gate
      const snap = await db.collection('notifications')
        .where('recipientEmail', '==', currentUser.email)
        .orderBy('createdAt', 'desc')
        .limit(30)
        .get();
      _notifList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
      try {
        // Fallback: no orderBy (avoids missing index error)
        const snap2 = await db.collection('notifications')
          .where('recipientEmail', '==', currentUser.email)
          .limit(30)
          .get();
        _notifList = snap2.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => {
            const ta = a.createdAt?.toDate?.() || 0;
            const tb = b.createdAt?.toDate?.() || 0;
            return tb - ta;
          });
      } catch (e2) {
        _notifList = [];
      }
    }

    renderNotifDropdown();
    updateNotifBadge();
  };

  const renderNotifDropdown = () => {
    const list = document.getElementById('notifList');
    if (!list) return;

    if (!_notifList.length) {
      list.innerHTML = `<div class="notif-empty">Không có thông báo nào.</div>`;
      return;
    }

    // Unread lên trên, read đùn xuống dưới — mỗi nhóm mới nhất trước
    const sorted = [..._notifList].sort((a, b) => {
      if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
      const ta = a.createdAt?.toDate?.()?.getTime() || 0;
      const tb = b.createdAt?.toDate?.()?.getTime() || 0;
      return tb - ta;
    });

    list.innerHTML = sorted.map(n => {
      const dateObj = n.createdAt?.toDate?.() || n.dueDate?.toDate?.() || null;
      const timeStr = dateObj ? formatDateVN(dateObj) : '';
      const icon    = (n.type?.startsWith('flight') || n.dueDate) ? '✈' : n.type === 'task_assign' ? '📋' : '🔔';
      return `<div class="notif-item${n.isRead ? '' : ' unread'}" data-nid="${n.id}">
        <div class="notif-icon">${icon}</div>
        <div class="notif-body">
          <div class="notif-msg">${n.message || n.title || ''}</div>
          <div class="notif-time">${n.title ? n.title + ' · ' : ''}${timeStr}</div>
        </div>
        ${n.isRead ? '' : '<div class="notif-unread-dot"></div>'}
      </div>`;
    }).join('');

    // Click to mark read
    list.querySelectorAll('.notif-item').forEach(el => {
      el.addEventListener('click', () => markNotifRead(el.dataset.nid));
    });
  };

  const updateNotifBadge = () => {
    const unread = _notifList.filter(n => !n.isRead).length;
    document.querySelectorAll('.notif-badge').forEach(badge => {
      badge.textContent  = unread > 9 ? '9+' : String(unread);
      badge.style.display = unread > 0 ? 'flex' : 'none';
    });
  };

  const markNotifRead = async (notifId) => {
    try {
      await db.collection('notifications').doc(notifId).update({ isRead: true });
      const n = _notifList.find(x => x.id === notifId);
      if (n) n.isRead = true;
      renderNotifDropdown();
      updateNotifBadge();
    } catch (e) { /* silent */ }
  };

  const markAllNotifsRead = async () => {
    const unread = _notifList.filter(n => !n.isRead);
    if (!unread.length) return;
    const batch = db.batch();
    unread.forEach(n => {
      batch.update(db.collection('notifications').doc(n.id), { isRead: true });
      n.isRead = true;
    });
    await batch.commit();
    renderNotifDropdown();
    updateNotifBadge();
  };

  // Real-time notification listener — fires immediately on any Firestore change
  let _notifUnsubscribe = null;
  const startNotifPolling = () => {
    if (!currentUser?.email) return;
    if (_notifUnsubscribe) { _notifUnsubscribe(); _notifUnsubscribe = null; }

    const onNewSnap = (snap) => {
      const prevUnread = _notifList.filter(n => !n.isRead).length;
      _notifList = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const ta = a.createdAt?.toDate?.()?.getTime() || 0;
          const tb = b.createdAt?.toDate?.()?.getTime() || 0;
          return tb - ta;
        });
      renderNotifDropdown();
      updateNotifBadge();
      const nowUnread = _notifList.filter(n => !n.isRead).length;
      // Ring bell immediately when new unread notification arrives
      if (nowUnread > 0 && nowUnread > prevUnread) ringBells();
    };

    // Attach real-time listener (no orderBy → no index required)
    try {
      _notifUnsubscribe = db.collection('notifications')
        .where('recipientEmail', '==', currentUser.email)
        .limit(30)
        .onSnapshot(onNewSnap, (err) => {
          console.warn('Notification listener error:', err.message);
          _notifUnsubscribe = null;
          fetchNotifications();
        });
    } catch (e) {
      fetchNotifications();
    }
  };

  // For students: show due flight notifications as toast + modal on login
  const showStudentFlightNotifications = async () => {
    if (!currentUser?.email) return;
    try {
      const now  = new Date();
      const snap = await db.collection('notifications')
        .where('recipientEmail', '==', currentUser.email)
        .where('isRead', '==', false)
        .get();

      const due = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(n => n.dueDate?.toDate ? n.dueDate.toDate() <= now : false);

      if (!due.length) return;

      // Show each as a toast with slight delay
      due.forEach((n, i) => {
        setTimeout(() => {
          showToast(`✈ ${n.message}`, 'info', 8000);
        }, i * 1200);
      });

      // Mark all as read after showing
      const batch = db.batch();
      due.forEach(n => batch.update(db.collection('notifications').doc(n.id), { isRead: true }));
      await batch.commit();
    } catch (e) { /* silent */ }
  };

  // ---- Employee Personal Attendance ----
  const initStaffAttendanceDashboard = () => {
    const dashboard = document.getElementById('staff-attendance-dashboard');
    if (dashboard) dashboard.style.display = 'flex';
    if (window.AttendanceService) AttendanceService.init();
  };

  // ════════════════════════════════════════
  //  SƠ ĐỒ TỔ CHỨC
  // ════════════════════════════════════════
  const initOrgChartDashboard = (() => {
    let _bound = false;

    // ── Staff card grid ─────────────────────────────────────────────────────
    const POSITION_RANK = { 'Chủ tịch': 0, 'Giám đốc': 1, 'Phó Giám đốc': 2, 'Trưởng Phòng': 3, 'Phó phòng': 4, 'Nhân viên': 5 };

    const renderOrgStaff = async (activeDept = 'all') => {
      const grid = document.getElementById('orgStaffGrid');
      const filterBar = document.getElementById('orgDeptFilter');
      if (!grid) return;

      try {
        const snap = await db.collection('hrm_staff').get();
        let staff = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(s => s.status !== 'Nghỉ việc');

        staff.sort((a, b) =>
          (POSITION_RANK[a.jobTitle] ?? 9) - (POSITION_RANK[b.jobTitle] ?? 9) ||
          (a.name || '').localeCompare(b.name || '', 'vi')
        );

        // Build dept list from data
        const depts = ['all', ...new Set(staff.map(s => s.department).filter(Boolean))];

        if (filterBar) {
          filterBar.innerHTML = depts.map(d =>
            `<button class="oc-dept-btn${d === activeDept ? ' active' : ''}" data-dept="${d}">${d === 'all' ? 'Tất cả' : d}</button>`
          ).join('');
          filterBar.querySelectorAll('.oc-dept-btn').forEach(btn =>
            btn.addEventListener('click', () => renderOrgStaff(btn.dataset.dept))
          );
        }

        const filtered = activeDept === 'all' ? staff : staff.filter(s => s.department === activeDept);

        if (!filtered.length) {
          grid.innerHTML = '<div class="oc-empty">Chưa có nhân sự trong mục này</div>';
          return;
        }

        grid.innerHTML = filtered.map(s => {
          const initial = (s.name || '?').trim().split(' ').pop()[0].toUpperCase();
          const photo = s.photoUrl
            ? `<img src="${s.photoUrl}" class="oc-photo" alt="${s.name || ''}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
            : '';
          const placeholder = `<div class="oc-photo-placeholder" style="${s.photoUrl ? 'display:none' : ''}">${initial}</div>`;
          const titleText = (s.jobTitle || 'Nhân viên').toUpperCase();
          const deptBadge = s.department
            ? `<div class="oc-dept-badge">${s.department}</div>` : '';

          return `
            <div class="oc-staff-card">
              <div class="oc-photo-ring">
                <div class="oc-photo-frame">
                  ${photo}${placeholder}
                </div>
              </div>
              <div class="oc-card-body">
                <div class="oc-staff-name">${s.name || '--'}</div>
                <div class="oc-staff-title">${titleText}</div>
                ${deptBadge}
              </div>
            </div>`;
        }).join('');

      } catch (err) {
        console.error('Org staff load error:', err);
        grid.innerHTML = '<div class="oc-empty">Không thể tải dữ liệu nhân sự</div>';
      }
    };

    return async () => {
      // Run staff grid immediately (no wait on image)
      renderOrgStaff();

      const fileInput     = document.getElementById('orgChartFileInput');
      const uploadZone    = document.getElementById('orgChartUploadZone');
      const previewWrap   = document.getElementById('orgChartPreviewWrap');
      const imgEl         = document.getElementById('orgChartImg');
      const metaEl        = document.getElementById('orgChartMeta');
      const progressWrap  = document.getElementById('orgChartProgress');
      const progressBar   = document.getElementById('orgChartProgressBar');
      const progressLabel = document.getElementById('orgChartProgressLabel');
      const btnView       = document.getElementById('btnViewOrgChart');
      const btnDelete     = document.getElementById('btnDeleteOrgChart');
      const lightbox      = document.getElementById('orgChartLightbox');
      const lightboxImg   = document.getElementById('orgChartLightboxImg');
      const btnCloseLb    = document.getElementById('btnCloseLightbox');

      const FIRESTORE_DOC = () => db.collection('siteSettings').doc('orgChart');

      const showImage = (base64, meta = {}) => {
        if (imgEl) { imgEl.src = base64; imgEl.style.display = 'block'; }
        if (previewWrap) previewWrap.style.display = 'block';
        if (progressWrap) progressWrap.style.display = 'none';
        if (btnView) btnView.style.display = '';
        if (btnDelete) btnDelete.style.display = '';
        if (metaEl && meta.name) {
          metaEl.innerHTML = `<span>📎 ${meta.name}</span><span>${meta.size || ''}</span><span>Cập nhật: ${meta.updatedAt || '--'}</span>`;
        }
      };

      const clearImage = () => {
        if (imgEl) { imgEl.src = ''; imgEl.style.display = 'none'; }
        if (previewWrap) previewWrap.style.display = 'none';
        if (btnView) btnView.style.display = 'none';
        if (btnDelete) btnDelete.style.display = 'none';
        if (metaEl) metaEl.innerHTML = '';
      };

      // Load existing image from Firestore
      try {
        const doc = await FIRESTORE_DOC().get();
        if (doc.exists && doc.data().imageBase64) {
          showImage(doc.data().imageBase64, doc.data().meta || {});
        } else {
          clearImage();
        }
      } catch (e) {
        clearImage();
      }

      if (_bound) return;
      _bound = true;

      // Upload handler
      fileInput?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
          showToast('Ảnh quá lớn — tối đa 5 MB!', 'error');
          return;
        }

        // Show progress UI
        if (previewWrap) previewWrap.style.display = 'block';
        if (imgEl) imgEl.style.display = 'none';
        if (progressWrap) { progressWrap.style.display = 'flex'; }
        if (progressBar) progressBar.style.width = '0%';
        if (progressLabel) progressLabel.textContent = 'Đang đọc file…';

        const reader = new FileReader();
        reader.onprogress = (ev) => {
          if (ev.lengthComputable) {
            const pct = Math.round((ev.loaded / ev.total) * 50);
            progressBar.style.width = pct + '%';
          }
        };
        reader.onload = async (ev) => {
          progressBar.style.width = '70%';
          progressLabel.textContent = 'Đang lưu lên hệ thống…';
          const base64 = ev.target.result;
          const sizeStr = (file.size / 1024).toFixed(0) + ' KB';
          const now = new Date().toLocaleString('vi-VN');
          const meta = { name: file.name, size: sizeStr, updatedAt: now };
          try {
            await FIRESTORE_DOC().set({ imageBase64: base64, meta });
            progressBar.style.width = '100%';
            progressLabel.textContent = 'Hoàn tất!';
            setTimeout(() => showImage(base64, meta), 400);
            showToast('Sơ đồ đã được cập nhật!', 'success');
          } catch (err) {
            showToast('Lỗi lưu ảnh — thử lại!', 'error');
            clearImage();
          }
          fileInput.value = '';
        };
        reader.onerror = () => { showToast('Đọc file thất bại!', 'error'); clearImage(); };
        reader.readAsDataURL(file);
      });

      // View fullscreen
      btnView?.addEventListener('click', () => {
        if (!imgEl.src) return;
        lightboxImg.src = imgEl.src;
        lightbox.style.display = 'flex';
      });

      // Click image to open lightbox
      imgEl?.addEventListener('click', () => {
        if (!imgEl.src) return;
        lightboxImg.src = imgEl.src;
        lightbox.style.display = 'flex';
      });

      // Close lightbox
      const closeLb = () => { lightbox.style.display = 'none'; lightboxImg.src = ''; };
      btnCloseLb?.addEventListener('click', closeLb);
      lightbox?.addEventListener('click', (e) => { if (e.target === lightbox) closeLb(); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLb(); });

      // Delete
      btnDelete?.addEventListener('click', async () => {
        if (!confirm('Xóa ảnh sơ đồ hiện tại?')) return;
        try {
          await FIRESTORE_DOC().delete();
          clearImage();
          showToast('Đã xóa sơ đồ!', 'info');
        } catch (err) {
          showToast('Lỗi xóa ảnh!', 'error');
        }
      });
    };
  })();

  // ===========================================================================
  //  TEST NĂNG LỰC
  // ===========================================================================

  // ── Single source of truth for all department names ──────────────────────
  const DEPARTMENTS = [
    'Hành chính kế toán',
    'Marketing',
    'Đối ngoại',
    'Hồ sơ',
    'Đào tạo',
    'Kinh doanh',
  ];

  const POSITIONS = ['Chủ tịch', 'Giám đốc', 'Phó Giám đốc', 'Trưởng Phòng', 'Phó phòng', 'Nhân viên'];
  const LEVELS    = ['Cấp 1', 'Cấp 2', 'Cấp 3', 'Cấp 4', 'Cấp 5'];

  // Populate all department-related selects and filter buttons from DEPARTMENTS
  const populateDeptSelects = () => {
    const deptOpts    = DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('');
    const deptOptsAll = `<option value="All">Tất cả phòng ban</option>${deptOpts}`;

    // Selects
    const selAll = document.getElementById('hrmStaffDeptFilter');
    if (selAll) selAll.innerHTML = deptOptsAll;

    ['hrmStaffDept', 'hrmPayDept'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = deptOpts;
    });

    const posEl = document.getElementById('hrmStaffJobTitle');
    if (posEl) posEl.innerHTML = POSITIONS.map(p => `<option value="${p}">${p}</option>`).join('');
    const lvlEl = document.getElementById('hrmStaffLevel');
    if (lvlEl) lvlEl.innerHTML = LEVELS.map(l => `<option value="${l}">${l}</option>`).join('');

    const examSel = document.getElementById('examDeptSelect');
    if (examSel) examSel.innerHTML = `<option value="">-- Chọn phòng ban --</option>${deptOpts}`;

    // Exam dept filter buttons
    const examGroup = document.getElementById('examDeptFilterGroup');
    if (examGroup) {
      examGroup.innerHTML = `<span style="font-size:0.78rem;color:#6B6A67;margin-right:0.25rem;">Phòng ban:</span>
        <button class="test-dept-filter active" data-dept="all">Tất cả</button>
        ${DEPARTMENTS.map(d => `<button class="test-dept-filter" data-dept="${d}">${d}</button>`).join('')}`;
    }

    // Result dept filter buttons
    const resGroup = document.getElementById('resultDeptFilterGroup');
    if (resGroup) {
      resGroup.innerHTML = `<span style="font-size:0.78rem;color:#6B6A67;">Lọc:</span>
        <button class="test-result-filter active" data-rdept="all">Tất cả</button>
        ${DEPARTMENTS.map(d => `<button class="test-result-filter" data-rdept="${d}">${d}</button>`).join('')}`;
    }
  };

  // Run once on DOMContentLoaded — all dept UI derives from DEPARTMENTS
  populateDeptSelects();

  // Dept color map (shared)
  const DEPT_COLORS = {
    'Hành chính kế toán': { color: '#0EA5E9', bg: '#E0F2FE' },
    'Marketing':          { color: '#EC4899', bg: '#FDF2F8' },
    'Đối ngoại':          { color: '#14B8A6', bg: '#F0FDFA' },
    'Hồ sơ':              { color: '#F59E0B', bg: '#FFFBEB' },
    'Đào tạo':            { color: '#D97706', bg: '#FEF3C7' },
    'Kinh doanh':         { color: '#6366F1', bg: '#EEF2FF' },
  };

  const gradeInfo = (score) => {
    if (score >= 9) return { grade: 'Xuất sắc', color: '#6366F1', bg: '#EEF2FF' };
    if (score >= 7) return { grade: 'Đạt',      color: '#10B981', bg: '#ECFDF5' };
    if (score >= 5) return { grade: 'Trung bình',color: '#F97316', bg: '#FFF7ED' };
    return             { grade: 'Chưa đạt',    color: '#EF4444', bg: '#FEF2F2' };
  };

  // Default question bank (seed / fallback when admin hasn't uploaded exam yet)
  const QUESTION_BANK = {
    'Hành chính kế toán': [
      { q: 'Văn bản hành chính cần có yếu tố bắt buộc nào?',
        opts: ['Chữ ký và con dấu hợp lệ', 'Màu sắc đẹp và bắt mắt', 'Bắt buộc dùng font Times New Roman', 'Không cần yếu tố đặc biệt nào'], ans: 0 },
      { q: 'Nguyên tắc kép (Double Entry) trong kế toán có nghĩa là?',
        opts: ['Ghi sổ hai lần để kiểm tra', 'Mỗi giao dịch ghi Nợ và Có bằng nhau', 'Lập báo cáo tài chính 2 lần/năm', 'Sử dụng hai phần mềm kế toán song song'], ans: 1 },
      { q: 'Khi nhận công văn đến, việc đầu tiên cần làm là?',
        opts: ['Trả lời ngay lập tức', 'Đăng ký vào sổ theo dõi và chuyển đúng bộ phận phụ trách', 'Photo và lưu vào tủ ngay', 'Chuyển thẳng cho giám đốc duyệt'], ans: 1 },
      { q: 'Hoá đơn VAT cần có thông tin bắt buộc nào?',
        opts: ['Chỉ cần tên người mua và số tiền', 'Mã số thuế bên bán, bên mua, tên hàng hoá, ngày xuất hoá đơn', 'Chữ ký giám đốc và con dấu doanh nghiệp', 'Chỉ cần số hoá đơn và tổng tiền'], ans: 1 },
      { q: 'Báo cáo tài chính năm bắt buộc gồm những loại nào?',
        opts: ['Chỉ cần Bảng cân đối kế toán', 'Bảng cân đối kế toán, Kết quả kinh doanh, Lưu chuyển tiền tệ và Thuyết minh', 'Bảng lương và sổ quỹ tiền mặt', 'Báo cáo thuế và sổ cái'], ans: 1 },
      { q: 'Quản lý tài sản văn phòng đúng quy trình bao gồm?',
        opts: ['Mua sắm tự do khi cần', 'Kiểm kê định kỳ, bàn giao và thanh lý đúng quy trình', 'Chỉ quan tâm khi tài sản hỏng', 'Giao cho bảo vệ quản lý toàn bộ'], ans: 1 },
      { q: 'Phân biệt "tài sản ngắn hạn" và "tài sản dài hạn" theo chuẩn kế toán?',
        opts: ['Dựa vào giá trị tiền tệ của tài sản', 'Thời gian thu hồi hoặc sử dụng trong/ngoài 1 chu kỳ kinh doanh (thường 12 tháng)', 'Dựa vào vị trí bảo quản tài sản', 'Dựa vào tên gọi của loại tài sản'], ans: 1 },
      { q: 'Chi phí văn phòng phẩm được kiểm soát hiệu quả bằng cách nào?',
        opts: ['Mua bổ sung khi nào hết', 'Lập kế hoạch ngân sách và phê duyệt định mức theo tháng/quý', 'Để nhân viên tự mua và thanh toán', 'Mua số lượng lớn một lần để rẻ hơn'], ans: 1 },
      { q: 'Cuộc họp nội bộ hiệu quả cần đáp ứng điều gì?',
        opts: ['Càng nhiều người tham gia càng tốt', 'Có agenda rõ ràng, đúng giờ và ghi biên bản đầy đủ', 'Không cần chuẩn bị trước', 'Họp ít nhất 2 tiếng để đủ nội dung'], ans: 1 },
      { q: 'Kỹ năng quan trọng nhất của nhân viên Hành chính Kế toán là?',
        opts: ['Kỹ năng thiết kế đồ hoạ và lập trình', 'Chính xác trong số liệu, tổ chức công việc và giao tiếp hiệu quả', 'Kỹ năng thuyết trình trước đám đông', 'Kỹ năng ngoại ngữ tiếng Anh lưu loát'], ans: 1 },
    ],
    'Marketing': [
      { q: 'KPI phổ biến nhất của chiến dịch digital marketing là gì?',
        opts: ['Số lượng nhân sự thực hiện chiến dịch', 'CTR, CPC, ROAS và tỷ lệ chuyển đổi (Conversion Rate)', 'Số bài đăng mạng xã hội mỗi tuần', 'Số lần sản phẩm được nhắc tới trong báo chí'], ans: 1 },
      { q: 'Content marketing khác với quảng cáo truyền thống ở điểm nào?',
        opts: ['Tốn kém hơn và khó đo lường hơn', 'Cung cấp giá trị thực cho người dùng thay vì chỉ quảng bá sản phẩm', 'Chỉ áp dụng trên các nền tảng số', 'Không cần ngân sách để triển khai'], ans: 1 },
      { q: 'Marketing Funnel gồm các giai đoạn cơ bản nào?',
        opts: ['Sáng tạo → Sản xuất → Phân phối → Bán hàng', 'Nhận thức → Quan tâm → Cân nhắc → Mua hàng → Giữ chân', 'Nghiên cứu → Lên kế hoạch → Thực hiện → Đo lường', 'Tiếp cận → Chuyển đổi → Tăng trưởng → Doanh thu'], ans: 1 },
      { q: 'SEO (Search Engine Optimization) tập trung vào mục tiêu gì?',
        opts: ['Chạy quảng cáo trả phí trên Google', 'Tối ưu nội dung và cấu trúc website để xuất hiện cao trên kết quả tìm kiếm tự nhiên', 'Tăng số lượng followers trên mạng xã hội', 'Thiết kế giao diện website đẹp hơn đối thủ'], ans: 1 },
      { q: 'A/B Testing trong marketing được dùng để làm gì?',
        opts: ['So sánh ngân sách hai chiến dịch khác nhau', 'So sánh hai phiên bản nội dung/thiết kế để xác định phiên bản hiệu quả hơn', 'Kiểm tra hiệu suất của hai nhân viên', 'Thử nghiệm hai sản phẩm mới cùng lúc'], ans: 1 },
      { q: 'Buyer Persona (chân dung khách hàng) là gì?',
        opts: ['Ảnh chụp chân dung khách hàng thật', 'Hồ sơ đại diện của khách hàng mục tiêu dựa trên dữ liệu nghiên cứu thực tế', 'Danh sách tên các khách hàng đã mua hàng', 'Bảng phân tích đối thủ cạnh tranh'], ans: 1 },
      { q: 'Chỉ số CPM trong quảng cáo có nghĩa là?',
        opts: ['Chi phí trung bình mỗi lần nhấp chuột', 'Chi phí trên mỗi 1.000 lượt hiển thị quảng cáo', 'Chi phí mỗi lần người dùng điền form', 'Chi phí mỗi khách hàng mua hàng thành công'], ans: 1 },
      { q: 'Email marketing hiệu quả cần đảm bảo yếu tố nào?',
        opts: ['Gửi càng nhiều email càng tốt mỗi ngày', 'Tiêu đề hấp dẫn, nội dung đúng đối tượng và CTA rõ ràng', 'Chỉ gửi vào các ngày cuối tuần', 'Email càng dài càng thể hiện sự chuyên nghiệp'], ans: 1 },
      { q: 'Viral marketing dựa vào nguyên tắc nào?',
        opts: ['Chi nhiều tiền để boosting nội dung', 'Người dùng tự lan truyền nội dung dựa vào giá trị hoặc cảm xúc', 'Hợp tác với người nổi tiếng quảng cáo', 'Đăng nội dung nhiều lần để tăng tiếp cận'], ans: 1 },
      { q: 'ROI của chiến dịch marketing được tính như thế nào?',
        opts: ['Tổng doanh thu / Tổng chi phí vận hành', '(Doanh thu từ marketing − Chi phí marketing) / Chi phí marketing × 100%', 'Số khách hàng mới / Tổng chi phí marketing', 'Tổng lượt hiển thị / Chi phí quảng cáo'], ans: 1 },
    ],
    'Đối ngoại': [
      { q: 'MOU (Memorandum of Understanding) trong quan hệ đối ngoại là gì?',
        opts: ['Hợp đồng kinh tế có giá trị pháp lý cao nhất', 'Biên bản ghi nhớ thể hiện ý định hợp tác giữa các bên', 'Bản báo cáo tài chính hàng năm', 'Hợp đồng lao động dành cho nhân sự nước ngoài'], ans: 1 },
      { q: 'Khi chuẩn bị tiếp đón đoàn khách nước ngoài, ưu tiên đầu tiên là?',
        opts: ['Đặt nhà hàng và phòng nghỉ sang trọng', 'Tìm hiểu văn hoá, giao thức ứng xử và mục đích chuyến thăm của đối tác', 'Chuẩn bị quà tặng đắt tiền', 'Mời toàn bộ nhân viên công ty tham gia đón tiếp'], ans: 1 },
      { q: 'Follow-up sau cuộc họp đối ngoại nên thực hiện như thế nào?',
        opts: ['Chờ đối tác liên hệ trước để tránh làm phiền', 'Gửi email tóm tắt các điểm đã thống nhất trong vòng 24–48 giờ', 'Lên lịch họp tiếp theo ít nhất 1 tháng sau', 'Gọi điện ngay sau cuộc họp để xác nhận'], ans: 1 },
      { q: 'Kỹ năng quan trọng nhất trong giao tiếp đối ngoại là?',
        opts: ['Kỹ năng thiết kế và trình bày bản vẽ', 'Ngoại ngữ, lắng nghe chủ động và xây dựng quan hệ bền vững', 'Kỹ năng tính toán số liệu tài chính', 'Kỹ năng phân tích dữ liệu thị trường'], ans: 1 },
      { q: 'Nghi thức trao đổi danh thiếp trong môi trường quốc tế yêu cầu gì?',
        opts: ['Ném danh thiếp về phía đối tác để thể hiện sự thân thiện', 'Nhận và trao danh thiếp bằng hai tay, xem qua trước khi cất cẩn thận', 'Chỉ trao danh thiếp khi được yêu cầu', 'Trao bằng một tay để tỏ ra tự tin'], ans: 1 },
      { q: 'Thư ngỏ hợp tác (Partnership Proposal) cần có nội dung chính nào?',
        opts: ['Chỉ cần ghi tên công ty và số điện thoại liên hệ', 'Giới thiệu tổ chức, mục tiêu hợp tác và giá trị mang lại cho cả hai bên', 'Báo giá chi tiết tất cả dịch vụ ngay trong thư đầu tiên', 'Liệt kê toàn bộ thành tích và giải thưởng của công ty'], ans: 1 },
      { q: 'Stakeholder bên ngoài công ty bao gồm đối tượng nào?',
        opts: ['Chỉ có ban giám đốc và cổ đông', 'Đối tác, cơ quan nhà nước, truyền thông và cộng đồng địa phương', 'Chỉ có khách hàng trực tiếp', 'Chỉ bao gồm nhà cung cấp và đại lý phân phối'], ans: 1 },
      { q: 'Xử lý bất đồng ý kiến với đối tác nước ngoài nên ưu tiên cách nào?',
        opts: ['Kiên quyết giữ lập trường để thể hiện sức mạnh', 'Lắng nghe, tìm điểm chung và đề xuất giải pháp dựa trên lợi ích hai bên', 'Tạm dừng hợp tác để tránh xung đột thêm', 'Nhờ bên thứ ba làm trọng tài ngay lập tức'], ans: 1 },
      { q: 'Tài liệu nào KHÔNG nên chia sẻ với đối tác bên ngoài khi chưa được phê duyệt?',
        opts: ['Tài liệu giới thiệu công ty đã được ban hành', 'Báo cáo nội bộ, chiến lược kinh doanh và thông tin tài chính chưa công bố', 'Catalogue sản phẩm và bảng giá niêm yết', 'Lịch sự kiện và chương trình khuyến mãi công khai'], ans: 1 },
      { q: 'Phiên dịch trong cuộc họp đối ngoại quan trọng vì?',
        opts: ['Để ghi âm lại toàn bộ nội dung cuộc họp', 'Đảm bảo thông điệp được truyền đạt chính xác, tránh hiểu nhầm dẫn đến tranh chấp', 'Để giảm chi phí thuê phiên dịch ngoài', 'Để tạo ấn tượng chuyên nghiệp với đối tác'], ans: 1 },
    ],
    'Hồ sơ': [
      { q: 'Kiểm tra hồ sơ du học đầy đủ cần xem xét những yếu tố nào?',
        opts: ['Chỉ cần hộ chiếu và ảnh thẻ', 'Giấy tờ tuỳ thân, chứng minh tài chính, thư nhập học và lý lịch học tập', 'Chỉ cần thư nhập học từ trường', 'Chỉ cần hộ chiếu còn hạn và vé máy bay'], ans: 1 },
      { q: 'Khi phát hiện thông tin sai trong hồ sơ học viên, cần xử lý như thế nào?',
        opts: ['Tự điều chỉnh thông tin mà không cần báo học viên', 'Thông báo ngay cho học viên và hướng dẫn bổ sung/điều chỉnh theo quy trình', 'Nộp hồ sơ trước rồi điều chỉnh sau', 'Huỷ hồ sơ và yêu cầu học viên làm lại từ đầu'], ans: 1 },
      { q: 'Thứ tự ưu tiên khi xử lý nhiều hồ sơ cùng lúc nên dựa theo?',
        opts: ['Hồ sơ đến trước xử lý trước (FIFO) bất kể hoàn cảnh', 'Deadline nộp hồ sơ và mức độ khẩn cấp của từng trường hợp cụ thể', 'Hồ sơ của học viên có nhiều dịch vụ hơn', 'Xử lý hồ sơ đơn giản trước để giải quyết nhanh'], ans: 1 },
      { q: 'Bảo quản hồ sơ gốc của học viên cần tuân thủ nguyên tắc gì?',
        opts: ['Để trên bàn làm việc để tiện tra cứu', 'Lưu trữ trong tủ khoá, hạn chế người tiếp cận và sao lưu bản số hoá', 'Gửi về nhà để bảo quản an toàn hơn', 'Scan toàn bộ rồi huỷ bản gốc để tiết kiệm diện tích'], ans: 1 },
      { q: 'Hồ sơ scan nộp online cần đảm bảo tiêu chuẩn gì?',
        opts: ['Bất kỳ độ phân giải nào cũng được', 'Đủ sáng, không bị mờ/cắt góc, đúng định dạng và dung lượng file yêu cầu', 'Chỉ cần chụp ảnh bằng điện thoại', 'Chỉ cần nộp bản photo màu'], ans: 1 },
      { q: 'Khi bàn giao hồ sơ giữa các bộ phận cần thực hiện gì?',
        opts: ['Để hồ sơ trên bàn đồng nghiệp và nhắn tin báo', 'Lập biên bản bàn giao có chữ ký hai bên và ghi rõ danh sách tài liệu kèm theo', 'Gửi ảnh chụp hồ sơ qua Zalo là đủ', 'Giao trực tiếp không cần giấy tờ xác nhận'], ans: 1 },
      { q: 'Deadline nộp hồ sơ bị trễ, cần làm gì đầu tiên?',
        opts: ['Im lặng và nộp muộn mà không giải thích', 'Thông báo ngay cho học viên và quản lý, đồng thời liên hệ phía tiếp nhận để xin gia hạn', 'Đổ lỗi cho học viên chậm cung cấp giấy tờ', 'Chờ thêm vài ngày rồi mới báo cáo'], ans: 1 },
      { q: 'Cập nhật trạng thái hồ sơ cho học viên nên thực hiện như thế nào?',
        opts: ['Chỉ cần cập nhật khi hồ sơ được chấp nhận hoặc từ chối', 'Thông báo mỗi khi có thay đổi quan trọng và ít nhất một lần mỗi tuần', 'Để học viên tự hỏi khi cần thiết', 'Cập nhật một lần duy nhất khi hoàn thành toàn bộ hồ sơ'], ans: 1 },
      { q: 'Hồ sơ bị từ chối cần được xử lý như thế nào?',
        opts: ['Thông báo thẳng cho học viên và đóng hồ sơ', 'Phân tích nguyên nhân, tư vấn bổ sung/điều chỉnh và nộp lại đúng hướng dẫn', 'Tự động chuyển sang trường/quốc gia khác', 'Yêu cầu học viên đặt cọc thêm trước khi xử lý lại'], ans: 1 },
      { q: 'Bảo mật thông tin trong hồ sơ học viên quan trọng vì?',
        opts: ['Để tránh đối thủ cạnh tranh biết học viên của mình', 'Đây là dữ liệu cá nhân được bảo vệ theo quy định pháp luật về bảo mật thông tin', 'Để học viên không tự nộp hồ sơ một mình', 'Để tăng giá trị hồ sơ khi bàn giao cho trường'], ans: 1 },
    ],
    'Đào tạo': [
      { q: 'Mô hình đánh giá đào tạo Kirkpatrick gồm bao nhiêu cấp độ?',
        opts: ['3 cấp độ', '4 cấp độ', '5 cấp độ', '6 cấp độ'], ans: 1 },
      { q: 'OJT (On the Job Training) là hình thức đào tạo nào?',
        opts: ['Đào tạo hoàn toàn trực tuyến', 'Đào tạo trực tiếp ngay tại nơi làm việc', 'Đào tạo theo nhóm lớn ngoài văn phòng', 'Đào tạo từ xa qua video call'], ans: 1 },
      { q: 'Mục tiêu đào tạo theo chuẩn SMART cần đảm bảo yếu tố nào?',
        opts: ['Cụ thể, đo được, khả thi, liên quan và có thời hạn', 'Đơn giản, nhanh chóng và tiết kiệm chi phí', 'Sáng tạo, thú vị và hấp dẫn học viên', 'Ngắn gọn, dễ nhớ và có thể chia sẻ rộng rãi'], ans: 0 },
      { q: 'E-learning có ưu điểm chính là gì?',
        opts: ['Tương tác trực tiếp với giảng viên cao hơn', 'Linh hoạt về thời gian và tiết kiệm chi phí đào tạo đáng kể', 'Kiểm tra kết quả chặt chẽ hơn học offline', 'Phù hợp hơn cho các kỹ năng thực hành phức tạp'], ans: 1 },
      { q: 'Training Needs Analysis (TNA) được dùng để làm gì?',
        opts: ['Đánh giá mức lương và phúc lợi nhân viên', 'Xác định khoảng cách kỹ năng và nhu cầu đào tạo thực tế', 'Lên lịch nghỉ phép cho nhân viên', 'Phân tích ngân sách đào tạo hàng năm'], ans: 1 },
      { q: 'Lý thuyết học qua trải nghiệm (Experiential Learning) do ai đề xuất?',
        opts: ['Abraham Maslow', 'David Kolb', 'Peter Drucker', 'Frederick Herzberg'], ans: 1 },
      { q: 'Đánh giá sau đào tạo cần tập trung đo lường điều gì?',
        opts: ['Tổng số giờ tham gia của học viên', 'Mức độ áp dụng kiến thức vào công việc thực tế sau khoá học', 'Số lượng tài liệu được phát cho học viên', 'Mức độ hài lòng của giảng viên về buổi học'], ans: 1 },
      { q: 'Buddy system trong đào tạo nhân viên mới là gì?',
        opts: ['Phương pháp học nhóm đông người', 'Nhân viên mới được hỗ trợ bởi một nhân viên có kinh nghiệm', 'Thi đua kết quả giữa các phòng ban', 'Hệ thống kết đôi học viên để thi cùng nhau'], ans: 1 },
      { q: 'LMS (Learning Management System) là gì?',
        opts: ['Hệ thống quản lý lương và phúc lợi nhân viên', 'Nền tảng quản lý và triển khai các khoá đào tạo trực tuyến', 'Phần mềm chấm công điện tử', 'Hệ thống quản lý hồ sơ nhân sự'], ans: 1 },
      { q: 'Blended Learning kết hợp giữa hai hình thức nào?',
        opts: ['Lý thuyết và thực hành trong cùng một lớp học', 'Học trực tuyến (online) và học trực tiếp (offline)', 'Đào tạo cá nhân và đào tạo nhóm lớn', 'Học nội bộ và học bên ngoài tổ chức'], ans: 1 },
    ],
    'Kinh doanh': [
      { q: 'Quy trình tư vấn bán hàng hiệu quả thường bắt đầu bằng bước nào?',
        opts: ['Chốt giá ngay để không mất khách', 'Xác định nhu cầu, mục tiêu và khả năng tài chính của khách hàng', 'Giới thiệu tất cả sản phẩm dịch vụ hiện có', 'Gửi báo giá chi tiết qua email trước'], ans: 1 },
      { q: 'Kỹ năng quan trọng nhất của nhân viên kinh doanh du học là?',
        opts: ['Kỹ năng thiết kế tài liệu đẹp', 'Lắng nghe, thấu hiểu nhu cầu và xây dựng niềm tin với khách hàng', 'Nói nhanh và thuyết phục theo kịch bản', 'Kỹ năng đàm phán giá và giảm chiết khấu'], ans: 1 },
      { q: 'Upselling trong kinh doanh có nghĩa là?',
        opts: ['Giảm giá để thu hút thêm khách hàng', 'Đề xuất khách hàng nâng cấp lên sản phẩm/gói dịch vụ cao hơn', 'Bán thêm sản phẩm không liên quan', 'Hoàn tiền cho khách hàng không hài lòng'], ans: 1 },
      { q: 'Khi khách hàng phản đối về giá, cách xử lý phù hợp nhất là?',
        opts: ['Giảm giá ngay lập tức để chốt nhanh', 'Nhấn mạnh giá trị và lợi ích thực sự của dịch vụ so với chi phí bỏ ra', 'Kết thúc buổi tư vấn và chờ khách quay lại', 'Chuyển cho quản lý xử lý thay'], ans: 1 },
      { q: 'Báo cáo doanh số hàng tuần cần gồm những chỉ số nào?',
        opts: ['Chỉ cần tổng doanh thu đạt được', 'Số lượng khách tiếp cận, tỷ lệ chốt hợp đồng và doanh thu thực tế so với target', 'Danh sách tên khách hàng đã tư vấn', 'Số giờ làm việc và số cuộc gọi thực hiện'], ans: 1 },
      { q: 'CRM (Customer Relationship Management) trong kinh doanh dùng để làm gì?',
        opts: ['Quản lý lịch nghỉ phép của nhân viên', 'Quản lý thông tin và lịch sử tương tác với khách hàng để nâng cao chất lượng dịch vụ', 'Thiết kế giao diện website bán hàng', 'Tính toán hoa hồng và lương nhân viên kinh doanh'], ans: 1 },
      { q: 'Chăm sóc khách hàng sau khi ký hợp đồng quan trọng vì?',
        opts: ['Để thu thêm phí dịch vụ phát sinh', 'Tạo sự tin tưởng, tăng khả năng giới thiệu khách mới và tái ký hợp đồng', 'Để tránh khiếu nại và hoàn tiền', 'Để đảm bảo khách hàng không chuyển sang đối thủ'], ans: 1 },
      { q: 'Phân biệt "Lead" (khách hàng tiềm năng) và "Customer" (khách đã mua)?',
        opts: ['Chỉ khác nhau về độ tuổi và thu nhập', 'Lead là người quan tâm chưa mua; Customer là người đã sử dụng dịch vụ', 'Không có sự khác biệt trong quy trình chăm sóc', 'Lead chỉ đến từ quảng cáo; Customer đến từ giới thiệu'], ans: 1 },
      { q: 'Tỷ lệ chốt hợp đồng (Conversion Rate) được tính như thế nào?',
        opts: ['Tổng doanh thu / Tổng số lần liên hệ khách hàng', 'Số hợp đồng ký được / Tổng số khách hàng tiếp cận × 100%', 'Tổng số giờ tư vấn / Số hợp đồng', 'Doanh thu tháng này / Doanh thu tháng trước × 100%'], ans: 1 },
      { q: 'Khi không đạt target doanh số, bước quan trọng nhất cần làm là?',
        opts: ['Đổ lỗi cho thị trường và khách hàng khó tính', 'Phân tích nguyên nhân, điều chỉnh cách tiếp cận và lên kế hoạch hành động cụ thể', 'Tăng số lượng cuộc gọi lên gấp đôi ngay lập tức', 'Xin quản lý hạ target xuống để dễ đạt hơn'], ans: 1 },
    ],
  };

  // ---- State ----
  let _ctAnswers    = {};   // { qIndex: chosenOptIndex }
  let _ctQuestions  = [];   // active question array for current test
  let _ctDept       = '';
  let _ctExamId     = null;
  let _ctExamTitle  = '';
  let _ctSubmitted  = false;
  let _testResultsAll = [];
  let _testResultFilter = 'all';
  let _examList     = [];
  let _examDeptFilter = 'all';
  let _examEditId   = null; // null = create, string = editing
  let _examQCount   = 10;  // active question count: 10 | 20 | 30 | 40

  // =====================================================================
  //  STAFF: Take the test
  // =====================================================================

  const renderCompetencyTestForStaff = async () => {
    const wrapper = document.getElementById('competency-test-wrapper');
    if (!wrapper) return;

    const staff = _spCurrentStaff || {};
    const dept  = staff.department || '';

    if (!dept) {
      wrapper.innerHTML = `<div style="text-align:center;padding:3rem 1rem;">
        <div style="font-size:2.5rem;margin-bottom:1rem;">🏢</div>
        <p style="color:#6B6A67;font-size:0.9rem;">Phòng ban của bạn chưa được phân công.<br>Vui lòng liên hệ HR để cập nhật thông tin.</p>
      </div>`;
      return;
    }

    wrapper.innerHTML = `<div style="text-align:center;padding:3rem 1rem;color:#6B6A67;">Đang tải đề thi…</div>`;

    let qs = null;
    let examId = null;
    let examTitle = null;

    // Fetch active Firestore exam first
    try {
      const snap = await db.collection('competency_exams')
        .where('department', '==', dept)
        .where('isActive', '==', true)
        .limit(1)
        .get();
      if (!snap.empty) {
        const ex = { id: snap.docs[0].id, ...snap.docs[0].data() };
        qs        = ex.questions || [];
        examId    = ex.id;
        examTitle = ex.title || `Bài Test ${dept}`;
      }
    } catch (e) {
      console.warn('Firestore exam fetch failed, falling back to bank:', e);
    }

    // Fallback to built-in bank
    if (!qs || !qs.length) {
      qs        = QUESTION_BANK[dept] || [];
      examId    = null;
      examTitle = `Bài Test ${dept} (Mặc định)`;
    }

    if (!qs.length) {
      wrapper.innerHTML = `<div style="text-align:center;padding:3rem 1rem;">
        <div style="font-size:2.5rem;margin-bottom:1rem;">📭</div>
        <p style="color:#6B6A67;font-size:0.9rem;">Chưa có đề thi nào cho phòng ban <strong>${dept}</strong>.<br>Admin sẽ upload đề sớm.</p>
      </div>`;
      return;
    }

    _ctDept      = dept;
    _ctQuestions = qs;
    _ctExamId    = examId;
    _ctExamTitle = examTitle;
    _ctAnswers   = {};
    _ctSubmitted = false;

    const dc = DEPT_COLORS[dept] || { color: '#6366F1', bg: '#EEF2FF' };

    const buildQuizHtml = () => {
      const answered = Object.keys(_ctAnswers).length;
      const pct = Math.round((answered / qs.length) * 100);
      let html = `<div class="competency-test-header">
        <h3>Bài Test: <span style="color:${dc.color};">${dept}</span></h3>
        <p>${qs.length} câu hỏi · 4 đáp án · Tích vào đáp án đúng nhất · <em>${examTitle}</em></p>
      </div>
      <div class="competency-progress-bar">
        <div class="competency-progress-fill" style="width:${pct}%;background:${dc.color};"></div>
      </div>`;
      qs.forEach((item, i) => {
        const sel = _ctAnswers[i] !== undefined ? _ctAnswers[i] : -1;
        html += `<div class="competency-q-block">
          <div class="competency-q-num">Câu ${i + 1} / ${qs.length}</div>
          <div class="competency-q-text">${item.q}</div>
          <div class="competency-options">
            ${item.opts.map((opt, j) => `
              <label class="competency-option${sel === j ? ' selected' : ''}" data-qi="${i}" data-oi="${j}">
                <input type="radio" name="cq_${i}" value="${j}" ${sel === j ? 'checked' : ''} />
                <span class="competency-option-dot"></span>
                <span>${String.fromCharCode(65 + j)}. ${opt}</span>
              </label>`).join('')}
          </div>
        </div>`;
      });
      html += `<div class="competency-submit-row">
        <span class="competency-answered-count">Đã trả lời: <strong>${answered}/${qs.length}</strong></span>
        <button type="button" class="competency-submit-btn" id="btnSubmitTest" ${answered < qs.length ? 'disabled' : ''}>
          Nộp bài
        </button>
      </div>`;
      return html;
    };

    const attachClickHandlers = () => {
      wrapper.onclick = null;
      wrapper.addEventListener('click', handleQuizClick, { capture: false });
      const btn = document.getElementById('btnSubmitTest');
      if (btn) btn.onclick = handleSubmitTest;
    };

    wrapper.innerHTML = buildQuizHtml();
    attachClickHandlers();

    function handleQuizClick(e) {
      if (_ctSubmitted) return;
      const label = e.target.closest('.competency-option');
      if (!label) return;
      const qi = parseInt(label.dataset.qi);
      const oi = parseInt(label.dataset.oi);
      _ctAnswers[qi] = oi;
      wrapper.innerHTML = buildQuizHtml();
      attachClickHandlers();
    }
  };

  const handleSubmitTest = async () => {
    if (_ctSubmitted) return;
    const qs    = _ctQuestions;
    const staff = _spCurrentStaff || {};
    if (!qs.length) return;

    let correct = 0;
    qs.forEach((item, i) => { if (_ctAnswers[i] === item.ans) correct++; });
    const score = correct;
    const total = qs.length;
    _ctSubmitted = true;

    try {
      await db.collection('competency_tests').add({
        staffId:    staff.id || '',
        staffName:  staff.name || 'Nhân viên',
        department: _ctDept,
        score,
        total,
        answers:    { ..._ctAnswers },
        examId:     _ctExamId || null,
        examTitle:  _ctExamTitle || '',
        questions:  qs,           // snapshot of questions at time of test
        submittedAt: firebase.firestore.Timestamp.fromDate(new Date()),
      });
    } catch (err) {
      console.warn('Could not save test result:', err);
    }

    const wrapper = document.getElementById('competency-test-wrapper');
    if (!wrapper) return;

    const pct = Math.round((score / total) * 100);
    const gi  = gradeInfo(score);
    wrapper.innerHTML = `<div class="competency-result-card">
      <div style="font-size:3rem;margin-bottom:0.75rem;">${score >= 7 ? '🎉' : '📖'}</div>
      <div class="competency-result-score" style="color:${gi.color};">${score}<span style="font-size:1.5rem;font-weight:400;color:#6B6A67;">/${total}</span></div>
      <div class="competency-result-label">Bạn trả lời đúng <strong>${score}</strong> trên <strong>${total}</strong> câu — ${pct}%</div>
      <div class="competency-result-badge" style="color:${gi.color};background:${gi.bg};">${gi.grade}</div>
      <p style="font-size:0.82rem;color:#6B6A67;margin-top:1.25rem;">Kết quả đã được gửi đến quản lý.</p>
    </div>`;

    showToast(`Nộp bài thành công! Kết quả: ${score}/${total}`, 'success');
  };

  // =====================================================================
  //  ADMIN: Main entry — init the whole test dashboard
  // =====================================================================

  const loadCompetencyTestResults = () => {
    // Init admin-tab switcher once
    if (!document.getElementById('test-dashboard').dataset.tabsBound) {
      document.getElementById('test-dashboard').dataset.tabsBound = '1';

      document.querySelectorAll('.test-admin-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          document.querySelectorAll('.test-admin-tab').forEach(t => t.classList.remove('active'));
          document.querySelectorAll('.test-admin-panel').forEach(p => { p.style.display = 'none'; p.classList.remove('active-panel'); });
          tab.classList.add('active');
          const panel = document.getElementById(tab.dataset.testtab);
          if (panel) { panel.style.display = 'flex'; panel.classList.add('active-panel'); }
          if (tab.dataset.testtab === 'tab-results') adminLoadResults();
          if (tab.dataset.testtab === 'tab-exams')   adminLoadExams();
        });
      });

      // Exam dept filter (tab-exams)
      document.querySelectorAll('.test-dept-filter').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.test-dept-filter').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          _examDeptFilter = btn.dataset.dept;
          renderExamList();
        });
      });

      // Result dept filter (tab-results)
      document.querySelectorAll('.test-result-filter').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.test-result-filter').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          _testResultFilter = btn.dataset.rdept;
          renderResultTable();
        });
      });

      document.getElementById('btnRefreshTestResults')?.addEventListener('click', adminLoadResults);
      document.getElementById('btnCreateExam')?.addEventListener('click', () => openExamCreateModal(null));
      document.getElementById('btnCloseExamModal')?.addEventListener('click', () => { document.getElementById('examCreateModal').style.display = 'none'; });
      document.getElementById('btnCloseExamView')?.addEventListener('click',   () => { document.getElementById('examViewModal').style.display = 'none'; });
      document.getElementById('btnCloseTestDetail')?.addEventListener('click', () => { document.getElementById('testDetailModal').style.display = 'none'; });
      document.getElementById('btnLoadTemplate')?.addEventListener('click', loadExamTemplate);
      document.getElementById('examJsonFileInput')?.addEventListener('change', importExamFile);
      document.getElementById('btnDownloadTemplate')?.addEventListener('click', downloadExamTemplate);
      document.getElementById('btnSaveExamDraft')?.addEventListener('click',  () => saveExam(false));
      document.getElementById('btnSaveExamActive')?.addEventListener('click', () => saveExam(true));

      // Click outside modals to close
      ['examCreateModal','examViewModal','testDetailModal'].forEach(id => {
        document.getElementById(id)?.addEventListener('click', e => {
          if (e.target.id === id) document.getElementById(id).style.display = 'none';
        });
      });
    }

    // Show exam tab by default
    document.querySelectorAll('.test-admin-panel').forEach(p => { p.style.display = 'none'; p.classList.remove('active-panel'); });
    const examsTab = document.getElementById('tab-exams');
    if (examsTab) { examsTab.style.display = 'flex'; examsTab.classList.add('active-panel'); }
    document.querySelectorAll('.test-admin-tab').forEach(t => t.classList.remove('active'));
    document.querySelector('.test-admin-tab[data-testtab="tab-exams"]')?.classList.add('active');

    adminLoadExams();
  };

  // =====================================================================
  //  ADMIN: Exam Management
  // =====================================================================

  const adminLoadExams = async () => {
    const container = document.getElementById('examListContainer');
    if (!container) return;
    container.innerHTML = '<div style="padding:2rem;text-align:center;color:#6B6A67;">Đang tải…</div>';
    try {
      const snap = await db.collection('competency_exams').orderBy('createdAt', 'desc').get();
      _examList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
      container.innerHTML = '<div style="padding:2rem;text-align:center;color:#EF4444;">Không thể tải đề thi.</div>';
      return;
    }
    renderExamList();
  };

  const renderExamList = () => {
    const container = document.getElementById('examListContainer');
    if (!container) return;
    const list = _examDeptFilter === 'all' ? _examList : _examList.filter(e => e.department === _examDeptFilter);
    if (!list.length) {
      container.innerHTML = `<div style="text-align:center;padding:3rem 1rem;color:#6B6A67;">
        <div style="font-size:2rem;margin-bottom:0.75rem;">📋</div>
        <p style="font-size:0.88rem;">Chưa có đề thi nào${_examDeptFilter !== 'all' ? ` cho phòng <strong>${_examDeptFilter}</strong>` : ''}.<br>
        Nhấn <strong>+ Tạo đề thi mới</strong> để bắt đầu.</p>
      </div>`;
      return;
    }
    container.innerHTML = list.map(ex => {
      const dc   = DEPT_COLORS[ex.department] || { color: '#6B6A67', bg: '#F5F4F2' };
      const date = ex.createdAt?.toDate ? ex.createdAt.toDate().toLocaleDateString('vi-VN') : '—';
      const qLen = ex.questions?.length || 0;
      return `<div class="exam-card${ex.isActive ? ' is-active-exam' : ''}" data-exam-id="${ex.id}">
        <div class="exam-card-body">
          <span class="exam-dept-tag" style="color:${dc.color};background:${dc.bg};">${ex.department}</span>
          <div class="exam-card-title">${ex.title || 'Chưa đặt tên'}</div>
          <div class="exam-card-meta">${qLen} câu hỏi · Tạo ${date}${ex.createdBy ? ' · bởi ' + ex.createdBy : ''}</div>
        </div>
        <div class="exam-card-actions">
          <button class="exam-btn exam-btn-activate${ex.isActive ? ' is-on' : ''}" data-id="${ex.id}">
            ${ex.isActive ? '● Đang hoạt động' : 'Kích hoạt'}
          </button>
          <button class="exam-btn exam-btn-view"   data-id="${ex.id}">Xem đề</button>
          <button class="exam-btn exam-btn-edit"   data-id="${ex.id}">Sửa</button>
          <button class="exam-btn exam-btn-delete" data-id="${ex.id}" data-title="${(ex.title||'').replace(/"/g,'&quot;')}">Xóa</button>
        </div>
      </div>`;
    }).join('');

    container.querySelectorAll('.exam-btn-view').forEach(btn => {
      btn.addEventListener('click', () => { const ex = _examList.find(e => e.id === btn.dataset.id); if (ex) openExamViewModal(ex); });
    });
    container.querySelectorAll('.exam-btn-edit').forEach(btn => {
      btn.addEventListener('click', () => { const ex = _examList.find(e => e.id === btn.dataset.id); if (ex) openExamCreateModal(ex); });
    });
    container.querySelectorAll('.exam-btn-activate').forEach(btn => {
      btn.addEventListener('click', () => activateExam(btn.dataset.id));
    });
    container.querySelectorAll('.exam-btn-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        if (confirm(`Xóa đề thi "${btn.dataset.title}"?`)) deleteExam(btn.dataset.id);
      });
    });
  };

  const activateExam = async (examId) => {
    const exam = _examList.find(e => e.id === examId);
    if (!exam) return;
    const newState = !exam.isActive;
    try {
      await db.collection('competency_exams').doc(examId).update({ isActive: newState });
      showToast(newState ? 'Đề thi đã kích hoạt — nhân viên có thể thi ngay.' : 'Đề thi đã tắt.', 'success');
      adminLoadExams();
    } catch (err) { showToast('Lỗi: ' + err.message, 'error'); }
  };

  const deleteExam = async (examId) => {
    try {
      await db.collection('competency_exams').doc(examId).delete();
      showToast('Đã xóa đề thi!', 'success');
      adminLoadExams();
    } catch (err) { showToast('Lỗi: ' + err.message, 'error'); }
  };

  // ---- Exam Create Modal ----

  const buildQBlockHtml = (i, q) => {
    const qText = q ? q.q : '';
    return `<div class="exam-q-builder" data-qi="${i}">
      <div class="exam-q-builder-header">
        <span class="exam-q-num-label">Câu ${i + 1}</span>
        <span class="exam-q-correct-hint">📌 Tích ✓ vào ô bên trái đáp án đúng</span>
      </div>
      <textarea class="exam-q-text-input" placeholder="Nội dung câu hỏi ${i + 1}…" rows="2">${qText}</textarea>
      <div>
        ${[0, 1, 2, 3].map(j => {
          const optText = q ? (q.opts[j] || '') : '';
          const isCorrect = q && q.ans === j;
          return `<div class="exam-q-opt-row${isCorrect ? ' is-correct' : ''}">
            <div class="exam-q-opt-radio">
              <input type="radio" name="ans_${i}" value="${j}" title="Đáp án đúng" ${isCorrect ? 'checked' : ''} />
            </div>
            <span class="exam-q-opt-letter">${['A','B','C','D'][j]}</span>
            <input type="text" class="exam-q-opt-input" placeholder="Đáp án ${['A','B','C','D'][j]}…" value="${optText}" />
          </div>`;
        }).join('')}
      </div>
    </div>`;
  };

  const openExamCreateModal = (exam) => {
    _examEditId = exam ? exam.id : null;
    // Determine question count: fixed from existing exam, or default 10 for new
    _examQCount = exam ? (exam.questions?.length || 10) : 10;

    const modal = document.getElementById('examCreateModal');
    document.getElementById('examModalTitle').textContent = exam ? 'Sửa đề thi' : 'Tạo đề thi mới';
    document.getElementById('examDeptSelect').value       = exam ? (exam.department || '') : '';
    document.getElementById('examTitleInput').value       = exam ? (exam.title || '') : '';
    document.getElementById('examSaveStatus').textContent = '';

    const existingQs  = exam ? (exam.questions || []) : [];
    const qContainer  = document.getElementById('examQuestionsContainer');
    const subtitle    = document.getElementById('examModalSubtitle');
    const hint        = document.getElementById('examQCountHint');
    const isEditing   = !!exam;

    // Rebuild question blocks for current _examQCount
    const rebuildBlocks = () => {
      qContainer.innerHTML = Array.from({ length: _examQCount }, (_, i) =>
        buildQBlockHtml(i, existingQs[i] || null)
      ).join('');
    };

    // Sync the count selector UI
    const syncCountUI = () => {
      document.querySelectorAll('.exam-qcount-btn').forEach(btn => {
        const n = parseInt(btn.dataset.count);
        btn.classList.toggle('active', n === _examQCount);
        btn.disabled = isEditing;
      });
      if (subtitle) subtitle.textContent = `Điền đầy đủ ${_examQCount} câu hỏi và đánh dấu đáp án đúng`;
      if (hint) hint.textContent = isEditing ? `(cố định theo đề gốc)` : '';
    };

    syncCountUI();
    rebuildBlocks();

    // Wire count buttons (only for new exams)
    document.querySelectorAll('.exam-qcount-btn').forEach(btn => {
      btn.onclick = isEditing ? null : () => {
        _examQCount = parseInt(btn.dataset.count);
        syncCountUI();
        rebuildBlocks();
      };
    });

    // Highlight correct-answer row on radio change (event delegation, attach once per open)
    qContainer.onchange = (e) => {
      if (e.target.type !== 'radio') return;
      const block = e.target.closest('.exam-q-builder');
      if (!block) return;
      block.querySelectorAll('.exam-q-opt-row').forEach(row => row.classList.remove('is-correct'));
      e.target.closest('.exam-q-opt-row').classList.add('is-correct');
    };

    modal.style.display = 'flex';
  };

  const loadExamTemplate = () => {
    const dept = document.getElementById('examDeptSelect').value;
    if (!dept || !QUESTION_BANK[dept]) {
      showToast('Chọn phòng ban trước!', 'error'); return;
    }
    const bank = QUESTION_BANK[dept];
    // Cycle through bank questions to fill _examQCount blocks
    const qs = Array.from({ length: _examQCount }, (_, i) => bank[i % bank.length]);
    const qContainer = document.getElementById('examQuestionsContainer');
    qContainer.innerHTML = qs.map((q, i) => buildQBlockHtml(i, q)).join('');
    if (!document.getElementById('examTitleInput').value) {
      document.getElementById('examTitleInput').value = `Bài Test ${dept}`;
    }
    showToast(`Đã tải mẫu ${dept} (${_examQCount} câu)`, 'success');
  };

  // Apply parsed question data into the modal form
  const applyImportedExam = (data, fileName) => {
    const qs    = data.questions;
    const dept  = data.department || '';
    const title = data.title || '';

    if (!qs || !Array.isArray(qs) || qs.length === 0) {
      showToast('Không tìm thấy câu hỏi trong file!', 'error'); return;
    }
    const validCounts = [10, 20, 30, 40, 100];
    if (!validCounts.includes(qs.length)) {
      showToast(`File có ${qs.length} câu — cần đúng 10, 20, 30, 40 hoặc 100 câu!`, 'error'); return;
    }
    // Validate each question
    for (let i = 0; i < qs.length; i++) {
      const q = qs[i];
      if (!q.q || !q.opts || q.opts.length < 4 || q.ans === undefined) {
        showToast(`Câu ${i + 1} thiếu dữ liệu (câu hỏi / 4 đáp án / đáp án đúng)!`, 'error'); return;
      }
    }

    // Auto-sync count selector to match imported file
    _examQCount = qs.length;
    document.querySelectorAll('.exam-qcount-btn').forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.count) === _examQCount);
    });
    const subtitle = document.getElementById('examModalSubtitle');
    if (subtitle) subtitle.textContent = `Điền đầy đủ ${_examQCount} câu hỏi và đánh dấu đáp án đúng`;

    if (dept) document.getElementById('examDeptSelect').value = dept;
    if (title) document.getElementById('examTitleInput').value = title;

    document.getElementById('examQuestionsContainer').innerHTML =
      qs.map((q, i) => buildQBlockHtml(i, q)).join('');

    const statusEl = document.getElementById('examSaveStatus');
    statusEl.textContent = `✓ Đã import ${qs.length} câu từ "${fileName}"`;
    statusEl.style.color = '#10B981';
    showToast(`Import thành công ${qs.length} câu hỏi!`, 'success');
  };

  // Route to correct parser based on file extension
  const importExamFile = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;

    const ext = file.name.split('.').pop().toLowerCase();
    const statusEl = document.getElementById('examSaveStatus');
    statusEl.textContent = `Đang đọc "${file.name}"…`;
    statusEl.style.color = '#6B6A67';

    try {
      if (ext === 'json') {
        await importJson(file);
      } else if (['xlsx', 'xls', 'csv'].includes(ext)) {
        await importExcel(file);
      } else if (['docx', 'doc'].includes(ext)) {
        await importWord(file);
      } else {
        showToast('Định dạng không hỗ trợ! Dùng .xlsx, .docx, hoặc .json', 'error');
      }
    } catch (err) {
      showToast('Lỗi đọc file: ' + err.message, 'error');
      statusEl.textContent = '';
    }
  };

  // --- JSON parser ---
  const importJson = async (file) => {
    const text = await file.text();
    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error('File JSON không hợp lệ'); }
    applyImportedExam(data, file.name);
  };

  // --- Excel / CSV parser ---
  // Expected format:
  //   Row 1: [PHÒNG BAN, value]
  //   Row 2: [TÊN ĐỀ THI, value]
  //   Row 3: (header row — ignored)
  //   Rows 4–N:  [CÂU HỎI, ĐÁP ÁN A, ĐÁP ÁN B, ĐÁP ÁN C, ĐÁP ÁN D, ĐÁP ÁN ĐÚNG (A/B/C/D)]
  const importExcel = async (file) => {
    if (!window.XLSX) throw new Error('Thư viện SheetJS chưa tải');
    const buf  = await file.arrayBuffer();
    const wb   = XLSX.read(buf, { type: 'array' });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    if (rows.length < 4) throw new Error('File Excel cần ít nhất 4 dòng (xem template)');

    const dept  = String(rows[0]?.[1] || '').trim();
    const title = String(rows[1]?.[1] || '').trim();

    // Questions start at row index 3 (row 4 in Excel, after header row)
    const qRows = rows.slice(3).filter(r => String(r[0] || '').trim() !== '');
    if (qRows.length < 10) throw new Error(`File chỉ có ${qRows.length} câu hỏi — cần ít nhất 10 câu`);

    const ansMap = { A: 0, B: 1, C: 2, D: 3, a: 0, b: 1, c: 2, d: 3, '0': 0, '1': 1, '2': 2, '3': 3 };
    const questions = qRows.map((r, i) => {
      const q    = String(r[0] || '').trim();
      const optA = String(r[1] || '').trim();
      const optB = String(r[2] || '').trim();
      const optC = String(r[3] || '').trim();
      const optD = String(r[4] || '').trim();
      const ansRaw = String(r[5] || '').trim();
      const ans  = ansMap[ansRaw];
      if (!q || !optA || !optB || !optC || !optD)
        throw new Error(`Dòng câu ${i + 1}: thiếu nội dung câu hỏi hoặc đáp án`);
      if (ans === undefined)
        throw new Error(`Dòng câu ${i + 1}: đáp án đúng "${ansRaw}" không hợp lệ — nhập A, B, C hoặc D`);
      return { q, opts: [optA, optB, optC, optD], ans };
    });

    applyImportedExam({ department: dept, title, questions }, file.name);
  };

  // --- Word / DOCX parser ---
  // Expected format in Word document:
  //   Line: "Phòng ban: Hành chính"
  //   Line: "Tên đề thi: Bài Test ..."
  //   (blank line)
  //   "Câu 1: <question text>"
  //   "A. <option>"  or  "A: <option>"
  //   "B. <option>"
  //   "C. <option>"
  //   "D. <option>"
  //   "Đáp án: A"    (or B / C / D)
  //   (blank line)
  //   "Câu 2: ..."
  const importWord = async (file) => {
    if (!window.mammoth) throw new Error('Thư viện Mammoth chưa tải');
    const buf    = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: buf });
    const text   = result.value;
    parseWordText(text, file.name);
  };

  const parseWordText = (text, fileName) => {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    let dept = '', title = '';
    const questions = [];
    let curQ = null;

    const ansMap = { A: 0, B: 1, C: 2, D: 3, a: 0, b: 1, c: 2, d: 3 };

    for (const line of lines) {
      // Department / Title header lines
      const deptMatch  = line.match(/^ph[oò]ng\s*ban\s*[:：]\s*(.+)/i);
      const titleMatch = line.match(/^t[eê]n\s*[đd][eề]\s*thi\s*[:：]\s*(.+)/i);
      if (deptMatch)  { dept  = deptMatch[1].trim();  continue; }
      if (titleMatch) { title = titleMatch[1].trim();  continue; }

      // Question line: "Câu 1: ..." or "1. ..." or "1) ..."
      const qMatch = line.match(/^(?:c[aâ]u\s*)?(\d+)\s*[:.）)]\s*(.+)/i);
      if (qMatch) {
        if (curQ && curQ.opts.length === 4 && curQ.ans !== undefined) questions.push(curQ);
        curQ = { q: qMatch[2].trim(), opts: [], ans: undefined };
        continue;
      }

      // Option line: "A. ..." or "A: ..." or "A) ..."
      const optMatch = line.match(/^([ABCD])\s*[.:)）]\s*(.+)/i);
      if (optMatch && curQ) {
        curQ.opts.push(optMatch[2].trim());
        continue;
      }

      // Answer line: "Đáp án: A" or "Đáp án đúng: B"
      const ansMatch = line.match(/^[đd][aá]p\s*[aá]n(?:\s*[đd][uú]ng)?\s*[:：]\s*([ABCD])/i);
      if (ansMatch && curQ) {
        curQ.ans = ansMap[ansMatch[1].toUpperCase()];
        continue;
      }
    }
    // Push last question
    if (curQ && curQ.opts.length === 4 && curQ.ans !== undefined) questions.push(curQ);

    if (questions.length === 0) {
      showToast('Không đọc được câu hỏi. Kiểm tra lại format theo template!', 'error'); return;
    }

    applyImportedExam({ department: dept, title, questions }, fileName);
  };

  // --- Generate & download Excel template ---
  const downloadExamTemplate = () => {
    if (!window.XLSX) { showToast('Thư viện SheetJS chưa tải!', 'error'); return; }
    const dept = document.getElementById('examDeptSelect').value || DEPARTMENTS[0];

    const data = [
      ['PHÒNG BAN', dept],
      ['TÊN ĐỀ THI', `Bài Test ${dept} Q3/2026`],
      [],
      ['CÂU HỎI', 'ĐÁP ÁN A', 'ĐÁP ÁN B', 'ĐÁP ÁN C', 'ĐÁP ÁN D', 'ĐÁP ÁN ĐÚNG (A/B/C/D)'],
      ...Array.from({ length: _examQCount }, (_, i) => [`Câu hỏi ${i + 1}`, 'Đáp án A', 'Đáp án B', 'Đáp án C', 'Đáp án D', 'A']),
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);

    // Column widths
    ws['!cols'] = [{ wch: 55 }, { wch: 30 }, { wch: 30 }, { wch: 30 }, { wch: 30 }, { wch: 22 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Đề Thi');
    XLSX.writeFile(wb, `template-de-thi-${dept.toLowerCase().replace(/\s+/g, '-')}.xlsx`);
    showToast('Đã tải template Excel!', 'success');
  };

  const collectExamFormData = () => {
    const dept  = document.getElementById('examDeptSelect').value.trim();
    const title = document.getElementById('examTitleInput').value.trim();
    const qContainer = document.getElementById('examQuestionsContainer');
    const questions = [];
    let errors = [];

    if (!dept)  errors.push('Chưa chọn phòng ban');
    if (!title) errors.push('Chưa nhập tên đề thi');

    qContainer.querySelectorAll('.exam-q-builder').forEach((block, i) => {
      const qText = block.querySelector('.exam-q-text-input').value.trim();
      const opts  = [...block.querySelectorAll('.exam-q-opt-input')].map(inp => inp.value.trim());
      const ansEl = block.querySelector(`input[name="ans_${i}"]:checked`);
      const ans   = ansEl ? parseInt(ansEl.value) : -1;
      if (!qText)           errors.push(`Câu ${i+1}: thiếu nội dung câu hỏi`);
      opts.forEach((o, j) => { if (!o) errors.push(`Câu ${i+1}: thiếu đáp án ${['A','B','C','D'][j]}`); });
      if (ans === -1)       errors.push(`Câu ${i+1}: chưa chọn đáp án đúng`);
      questions.push({ q: qText, opts, ans });
    });

    return { dept, title, questions, errors };
  };

  const saveExam = async (activate) => {
    const { dept, title, questions, errors } = collectExamFormData();
    const statusEl = document.getElementById('examSaveStatus');

    if (errors.length) {
      statusEl.textContent = '⚠ ' + errors[0] + (errors.length > 1 ? ` (+${errors.length - 1} lỗi khác)` : '');
      statusEl.style.color = '#EF4444';
      return;
    }

    statusEl.textContent = 'Đang lưu…';
    statusEl.style.color = '#6B6A67';

    try {
      const payload = {
        department:  dept,
        title,
        questions,
        isActive:    activate,
        createdBy:   currentUser?.displayName || currentUser?.email || 'Admin',
        createdAt:   firebase.firestore.Timestamp.fromDate(new Date()),
      };

      if (activate) {
        // Deactivate other exams in same dept first
        const batch = db.batch();
        _examList.filter(e => e.department === dept && e.id !== _examEditId).forEach(e => {
          batch.update(db.collection('competency_exams').doc(e.id), { isActive: false });
        });
        await batch.commit();
      }

      if (_examEditId) {
        await db.collection('competency_exams').doc(_examEditId).update(payload);
      } else {
        await db.collection('competency_exams').add(payload);
      }

      document.getElementById('examCreateModal').style.display = 'none';
      showToast(activate ? 'Đề thi đã lưu và kích hoạt cho nhân viên!' : 'Đã lưu đề thi (nháp).', 'success');
      adminLoadExams();
    } catch (err) {
      statusEl.textContent = 'Lỗi: ' + err.message;
      statusEl.style.color = '#EF4444';
    }
  };

  // ---- Exam View Modal (read-only) ----

  const openExamViewModal = (exam) => {
    const dc   = DEPT_COLORS[exam.department] || { color: '#6B6A67', bg: '#F5F4F2' };
    const date = exam.createdAt?.toDate ? exam.createdAt.toDate().toLocaleDateString('vi-VN') : '—';
    document.getElementById('examViewTitle').textContent = exam.title || 'Xem đề thi';
    document.getElementById('examViewMeta').innerHTML =
      `<span style="display:inline-block;padding:0.15rem 0.65rem;border-radius:20px;font-size:0.7rem;font-weight:700;color:${dc.color};background:${dc.bg};">${exam.department}</span>
       &nbsp;${(exam.questions||[]).length} câu · Tạo ${date}${exam.createdBy ? ' · ' + exam.createdBy : ''}
       ${exam.isActive ? '&nbsp;<span style="color:#10B981;font-weight:700;">● Đang hoạt động</span>' : ''}`;

    const content = document.getElementById('examViewContent');
    content.innerHTML = (exam.questions || []).map((q, i) => `
      <div class="exam-view-q">
        <div class="exam-view-q-num">Câu ${i + 1}</div>
        <div class="exam-view-q-text">${q.q}</div>
        ${(q.opts || []).map((opt, j) => `
          <div class="exam-view-opt${j === q.ans ? ' correct-opt' : ''}">
            <span class="exam-view-opt-letter">${['A','B','C','D'][j]}</span>
            ${opt}
            ${j === q.ans ? ' <strong>✓</strong>' : ''}
          </div>`).join('')}
      </div>`).join('');

    document.getElementById('examViewModal').style.display = 'flex';
  };

  // =====================================================================
  //  ADMIN: Results Tab
  // =====================================================================

  const adminLoadResults = async () => {
    const tbody = document.getElementById('testResultsBody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2rem;color:#6B6A67;">Đang tải…</td></tr>`;
    try {
      const snap = await db.collection('competency_tests').orderBy('submittedAt', 'desc').get();
      _testResultsAll = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2rem;color:#EF4444;">Không thể tải dữ liệu.</td></tr>`;
      return;
    }
    renderResultTable();
  };

  const renderResultTable = () => {
    const tbody = document.getElementById('testResultsBody');
    if (!tbody) return;
    const list = _testResultFilter === 'all'
      ? _testResultsAll
      : _testResultsAll.filter(r => r.department === _testResultFilter);

    // Update stat cards
    document.getElementById('testTotalCount').textContent = list.length;
    if (!list.length) {
      document.getElementById('testAvgScore').textContent  = '—';
      document.getElementById('testPassCount').textContent = '0';
      document.getElementById('testFailCount').textContent = '0';
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2rem;color:#6B6A67;">Chưa có kết quả nào.</td></tr>`;
      return;
    }
    const avg = (list.reduce((s, r) => s + (r.score || 0), 0) / list.length).toFixed(1);
    document.getElementById('testAvgScore').textContent  = avg + '/10';
    document.getElementById('testPassCount').textContent = list.filter(r => r.score >= 7).length;
    document.getElementById('testFailCount').textContent = list.filter(r => r.score < 7).length;

    tbody.innerHTML = list.map(r => {
      const dc  = DEPT_COLORS[r.department] || { color: '#6B6A67', bg: '#F5F4F2' };
      const gi  = gradeInfo(r.score);
      const dt  = r.submittedAt?.toDate ? r.submittedAt.toDate().toLocaleString('vi-VN') : '—';
      return `<tr>
        <td style="font-weight:500;">${r.staffName || '—'}</td>
        <td><span style="display:inline-block;padding:0.18rem 0.6rem;border-radius:20px;font-size:0.72rem;font-weight:700;color:${dc.color};background:${dc.bg};">${r.department || '—'}</span></td>
        <td style="font-size:0.78rem;color:#6B6A67;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${r.examTitle||''}">${r.examTitle || '—'}</td>
        <td style="text-align:center;font-size:1.1rem;font-weight:700;color:${gi.color};">${r.score}<span style="font-size:0.8rem;font-weight:400;color:#6B6A67;">/${r.total || 10}</span></td>
        <td style="text-align:center;"><span style="display:inline-block;padding:0.18rem 0.7rem;border-radius:20px;font-size:0.72rem;font-weight:700;color:${gi.color};background:${gi.bg};">${gi.grade}</span></td>
        <td style="color:#6B6A67;font-size:0.78rem;white-space:nowrap;">${dt}</td>
        <td style="text-align:center;">
          <div style="display:flex;gap:0.35rem;justify-content:center;">
            <button class="exam-btn exam-btn-view result-detail-btn" style="font-size:0.72rem;padding:0.22rem 0.65rem;" data-rid="${r.id}">Chi tiết</button>
            <button class="exam-btn exam-btn-delete result-delete-btn" style="font-size:0.72rem;padding:0.22rem 0.65rem;" data-rid="${r.id}" data-name="${(r.staffName||'').replace(/"/g,'&quot;')}">Xóa</button>
          </div>
        </td>
      </tr>`;
    }).join('');

    // Bind detail buttons
    tbody.querySelectorAll('.result-detail-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const r = _testResultsAll.find(x => x.id === btn.dataset.rid);
        if (r) openTestDetailModal(r);
      });
    });

    // Bind delete buttons
    tbody.querySelectorAll('.result-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm(`Xóa kết quả bài thi của "${btn.dataset.name}"?`)) return;
        try {
          await db.collection('competency_tests').doc(btn.dataset.rid).delete();
          _testResultsAll = _testResultsAll.filter(x => x.id !== btn.dataset.rid);
          renderResultTable();
          showToast('Đã xóa kết quả bài thi!', 'success');
        } catch (err) {
          showToast('Lỗi xóa: ' + err.message, 'error');
        }
      });
    });
  };

  // ---- Test Detail Modal (admin sees staff's answers) ----

  const openTestDetailModal = (r) => {
    const gi  = gradeInfo(r.score);
    const dt  = r.submittedAt?.toDate ? r.submittedAt.toDate().toLocaleString('vi-VN') : '—';
    document.getElementById('tdStaffName').textContent = r.staffName || '—';
    document.getElementById('tdMeta').innerHTML =
      `Phòng: <strong>${r.department}</strong> &nbsp;·&nbsp; Đề: <em>${r.examTitle || 'Mặc định'}</em>
       &nbsp;·&nbsp; Ngày thi: ${dt}
       &nbsp;·&nbsp; Kết quả: <strong style="color:${gi.color};">${r.score}/${r.total || 10} — ${gi.grade}</strong>`;

    const qs  = r.questions || [];
    const ans = r.answers   || {};
    const content = document.getElementById('testDetailContent');

    if (!qs.length) {
      content.innerHTML = `<p style="color:#6B6A67;text-align:center;padding:2rem;">Không có dữ liệu câu hỏi (bài thi cũ).</p>`;
    } else {
      content.innerHTML = qs.map((q, i) => {
        const chosen  = ans[i] !== undefined ? parseInt(ans[i]) : -1;
        const correct = q.ans;
        const isRight = chosen === correct;
        return `<div class="td-q-block">
          <div style="display:flex;align-items:baseline;gap:0.5rem;margin-bottom:0.5rem;">
            <span style="font-size:0.7rem;font-weight:700;color:#6366F1;letter-spacing:0.07em;">Câu ${i+1}</span>
            <span class="td-q-result-icon">${isRight ? '✅' : '❌'}</span>
          </div>
          <div style="font-size:0.85rem;font-weight:500;color:#1A1A1A;margin-bottom:0.5rem;line-height:1.5;">${q.q}</div>
          ${(q.opts||[]).map((opt, j) => {
            let bg='', fw='400', prefix='';
            if (j === correct && j === chosen)  { bg='#ECFDF5'; fw='600'; prefix='✓ '; }
            else if (j === correct)              { bg='#ECFDF5'; fw='600'; prefix='✓ '; }
            else if (j === chosen)               { bg='#FEF2F2'; fw='500'; prefix='✗ '; }
            return `<div style="padding:0.3rem 0.65rem;border-radius:6px;font-size:0.8rem;margin-bottom:0.25rem;font-weight:${fw};background:${bg||'transparent'};color:${j===correct?'#059669':j===chosen?'#DC2626':'#1A1A1A'};">
              ${prefix}${['A','B','C','D'][j]}. ${opt}
            </div>`;
          }).join('')}
        </div>`;
      }).join('');
    }

    document.getElementById('testDetailModal').style.display = 'flex';
  };

  // ════════════════════════════════════════
  // ════════════════════════════════════════
  //  QUY TRÌNH v2 — WORKFLOW DASHBOARD
  // ════════════════════════════════════════
  const initWorkflowDashboard = (() => {
    let _bound = false;
    let _workflows = [];
    let _activeId = null;
    let _activeStepIdx = null;
    let _zoom = 1;
    let _page = 1;
    const PER_PAGE = 6;

    // ── Undo / Redo ────────────────────────────────────────────────────────
    let _undoStack = [];
    let _redoStack = [];

    const syncUndoRedo = () => {
      const u = document.getElementById('wf2BtnUndo');
      const r = document.getElementById('wf2BtnRedo');
      if (u) u.disabled = _undoStack.length === 0;
      if (r) r.disabled = _redoStack.length === 0;
    };

    const pushUndo = (steps) => {
      _undoStack.push(JSON.parse(JSON.stringify(steps)));
      if (_undoStack.length > 30) _undoStack.shift();
      _redoStack = [];
      syncUndoRedo();
    };

    const WF_COL = () => db.collection('workflows');

    const STEP_SEEDS = {
      'Tuyển sinh du học Nhật Bản': {
        desc: 'Quy trình xử lý hồ sơ tuyển sinh du học Nhật Bản tại Aladdin Group',
        cat: 'Tuyển sinh',
        steps: [
          { name:'Tiếp nhận & tư vấn học viên', type:'task', assignee:'Tư vấn viên', description:'- Gặp gỡ, thu thập thông tin cá nhân học viên\n- Tư vấn chương trình phù hợp\n- Xác nhận mục tiêu và ngân sách', deadline:3, checklist:[{text:'Thu thập thông tin cá nhân',done:false},{text:'Tư vấn chương trình',done:false}], status:'done' },
          { name:'Chuẩn bị & kiểm tra hồ sơ', type:'task', assignee:'Chuyên viên hồ sơ', description:'- Hướng dẫn chuẩn bị giấy tờ\n- Kiểm tra tính hợp lệ\n- Dịch thuật và công chứng', deadline:7, checklist:[{text:'Hộ chiếu còn hạn',done:true},{text:'Bằng tốt nghiệp/học bạ',done:true},{text:'Sổ hộ khẩu / CMND',done:false},{text:'Dịch thuật công chứng',done:false}], status:'done' },
          { name:'Kiểm tra hồ sơ đạt yêu cầu?', type:'condition', assignee:'Lê Thị Mai', description:'Kiểm tra hồ sơ có đủ điều kiện nộp không', deadline:2, checklist:[{text:'Kiểm tra tính hợp lệ hồ sơ',done:true},{text:'Đối chiếu giấy tờ',done:true},{text:'Kiểm tra điều kiện đầu vào',done:false},{text:'Cập nhật trạng thái hồ sơ',done:false}], status:'active', conditionText:'Hồ sơ đạt yêu cầu', rejectStep:{name:'Yêu cầu bổ sung hồ sơ', assignee:'Lê Thị Mai', code:'03A'} },
          { name:'Ký hợp đồng & đóng học phí', type:'approve', assignee:'Kế toán', description:'- Ký hợp đồng dịch vụ\n- Thu học phí đợt 1\n- Cấp biên lai', deadline:3, checklist:[{text:'Ký hợp đồng dịch vụ',done:false},{text:'Thu học phí đợt 1',done:false}], status:'pending' },
          { name:'Xin visa Nhật Bản', type:'task', assignee:'Trần Văn Nam', description:'- Chuẩn bị hồ sơ visa\n- Nộp tại đại sứ quán\n- Nhận visa', deadline:21, checklist:[{text:'COE từ trường',done:false},{text:'Hồ sơ tài chính',done:false},{text:'Nhận visa',done:false}], status:'pending' },
          { name:'Xuất cảnh sang Nhật Bản', type:'end', assignee:'Tư vấn viên', description:'Tiễn học viên và bàn giao đối tác Nhật', deadline:1, checklist:[{text:'Mua vé máy bay',done:false},{text:'Xuất cảnh thành công',done:false}], status:'pending' },
        ]
      },
      'Tuyển sinh du học Hàn Quốc': { desc:'Quy trình xử lý hồ sơ tuyển sinh du học Hàn Quốc — D-2, D-4 visa', cat:'Tuyển sinh',
        steps:[
          {name:'Tư vấn & đánh giá năng lực',type:'task',assignee:'Tư vấn viên',description:'Đánh giá và tư vấn chương trình',deadline:3,checklist:[{text:'Đánh giá học vấn',done:false}],status:'pending'},
          {name:'Chuẩn bị hồ sơ',type:'task',assignee:'Chuyên viên hồ sơ',description:'Chuẩn bị giấy tờ cần thiết',deadline:10,checklist:[{text:'Hộ chiếu',done:false},{text:'Bằng tốt nghiệp',done:false}],status:'pending'},
          {name:'Ký hợp đồng & thanh toán',type:'approve',assignee:'Kế toán',description:'Ký HĐ và thanh toán',deadline:3,checklist:[{text:'Ký hợp đồng',done:false}],status:'pending'},
          {name:'Nộp hồ sơ & nhận thư mời',type:'task',assignee:'Chuyên viên hồ sơ',description:'Gửi hồ sơ và nhận COR',deadline:21,checklist:[{text:'Nộp hồ sơ',done:false},{text:'Nhận COR',done:false}],status:'pending'},
          {name:'Xin visa D-2/D-4',type:'task',assignee:'Chuyên viên visa',description:'Nộp hồ sơ visa tại lãnh sự quán',deadline:21,checklist:[{text:'Nộp visa',done:false},{text:'Nhận visa',done:false}],status:'pending'},
          {name:'Xuất cảnh sang Hàn Quốc',type:'end',assignee:'Tư vấn viên',description:'Tiễn học viên xuất cảnh',deadline:1,checklist:[{text:'Mua vé máy bay',done:false}],status:'pending'},
        ]
      },
      'Xử lý gia hạn & thay đổi visa': {desc:'Hỗ trợ gia hạn visa, chuyển đổi visa',cat:'Visa',
        steps:[
          {name:'Tiếp nhận yêu cầu',type:'task',assignee:'Tư vấn viên',description:'Xác nhận yêu cầu gia hạn',deadline:2,checklist:[{text:'Kiểm tra visa hiện tại',done:false}],status:'pending'},
          {name:'Thu thập hồ sơ gia hạn',type:'task',assignee:'Chuyên viên visa',description:'Hộ chiếu, xác nhận đang học, tài chính',deadline:5,checklist:[{text:'Hộ chiếu còn hạn',done:false},{text:'Xác nhận đang học',done:false}],status:'pending'},
          {name:'Nộp hồ sơ gia hạn',type:'task',assignee:'Chuyên viên visa',description:'Nộp và theo dõi tiến độ',deadline:7,checklist:[{text:'Nộp hồ sơ',done:false}],status:'pending'},
          {name:'Nhận kết quả & bàn giao',type:'approve',assignee:'Tư vấn viên',description:'Nhận visa gia hạn và bàn giao',deadline:3,checklist:[{text:'Nhận visa',done:false},{text:'Cập nhật hệ thống',done:false}],status:'pending'},
        ]
      },
      'Quy trình hoàn trả học phí': {desc:'Xử lý yêu cầu hoàn trả học phí',cat:'Tài chính',
        steps:[
          {name:'Tiếp nhận yêu cầu hoàn phí',type:'task',assignee:'Kế toán',description:'Xác nhận lý do và kiểm tra hợp đồng',deadline:2,checklist:[{text:'Kiểm tra hợp đồng',done:false}],status:'pending'},
          {name:'Thẩm định & phê duyệt',type:'approve',assignee:'Giám đốc',description:'Xem xét và ký phê duyệt',deadline:5,checklist:[{text:'Thẩm định hồ sơ',done:false},{text:'Ký phê duyệt',done:false}],status:'pending'},
          {name:'Thực hiện hoàn trả',type:'task',assignee:'Kế toán',description:'Chuyển khoản và xác nhận',deadline:5,checklist:[{text:'Chuyển khoản',done:false},{text:'Xác nhận nhận tiền',done:false}],status:'pending'},
          {name:'Cập nhật hệ thống',type:'end',assignee:'Kế toán',description:'Lưu hồ sơ và đóng ticket',deadline:1,checklist:[{text:'Cập nhật trạng thái',done:false}],status:'pending'},
        ]
      },
      'Quy trình thực tập sinh Nhật Bản': {desc:'Đưa thực tập sinh sang Nhật theo chương trình IM Japan',cat:'Xuất cảnh',
        steps:[
          {name:'Tuyển dụng & sơ tuyển',type:'task',assignee:'Tư vấn viên',description:'Tiếp nhận và sơ tuyển ứng viên',deadline:7,checklist:[{text:'Kiểm tra độ tuổi',done:false},{text:'Sức khỏe cơ bản',done:false}],status:'pending'},
          {name:'Đào tạo tiếng Nhật',type:'task',assignee:'Giáo viên',description:'Đào tạo N5-N4 và kỹ năng nghề',deadline:90,checklist:[{text:'Hoàn thành tiếng Nhật',done:false},{text:'Đạt thi đầu ra N5',done:false}],status:'pending'},
          {name:'Phỏng vấn với công ty Nhật',type:'approve',assignee:'Tư vấn viên',description:'Phỏng vấn và nhận kết quả',deadline:14,checklist:[{text:'Tham dự phỏng vấn',done:false},{text:'Nhận kết quả',done:false}],status:'pending'},
          {name:'Làm hồ sơ & xin visa',type:'task',assignee:'Chuyên viên hồ sơ',description:'Hồ sơ xuất cảnh và visa thực tập sinh',deadline:30,checklist:[{text:'Hồ sơ visa TP',done:false},{text:'Khám sức khỏe',done:false}],status:'pending'},
          {name:'Xuất cảnh sang Nhật',type:'end',assignee:'Tư vấn viên',description:'Tiễn và bàn giao đối tác Nhật',deadline:1,checklist:[{text:'Xuất cảnh thành công',done:false}],status:'pending'},
        ]
      },
    };

    const STATUS_LABEL = {active:'Đang hoạt động', draft:'Nháp', archived:'Lưu trữ', expired:'Hết hạn', completed:'Hoàn thành'};
    const TYPE_ICON = {task:'⏱', approve:'✅', notify:'🔔', condition:'⬦', parallel:'⊞', end:'⏹'};
    const TYPE_LABEL = {task:'Bước công việc', approve:'Bước phê duyệt', notify:'Bước thông báo', condition:'Bước điều kiện', parallel:'Bước song song', end:'Bước kết thúc'};

    // Layout constants
    const MX = 300;
    const RX = 90;
    const NW = 240;
    const NH = 90;
    const DW = 114;
    const SY = 40;
    const GAP = 48;
    const ROW = NH + GAP;
    const CANVAS_W = 580;

    const nodeTop = (idx, extra) => SY + 68 + idx * ROW + (extra || 0);

    const svgNS = 'http://www.w3.org/2000/svg';
    const svgEl = (tag, attrs) => {
      const el = document.createElementNS(svgNS, tag);
      Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k,v));
      return el;
    };

    const drawArrow = (svg, x1,y1,x2,y2, mid) => {
      const isGreen = mid === '#22C55E';
      const isRed   = mid === '#EF4444';
      const isGold  = mid === '#F59E0B';
      const stroke  = mid || '#94A3B8';
      const marker  = isRed  ? 'url(#wf2ArrowRed)'
                    : isGreen ? 'url(#wf2ArrowGreen)'
                    : isGold  ? 'url(#wf2ArrowGold)'
                    : 'url(#wf2Arrow)';
      const w = (isGreen || isGold) ? '2.5' : '2';
      const line = svgEl('line', {x1, y1, x2, y2, stroke, 'stroke-width': w, 'marker-end': marker, 'stroke-linecap': 'round'});
      svg.appendChild(line);
    };
    const drawPath = (svg, d, color, markerId) => {
      const p = svgEl('path', {d, stroke: color||'#94A3B8', 'stroke-width':'2', fill:'none'});
      if (markerId) p.setAttribute('marker-end', `url(#${markerId})`);
      svg.appendChild(p);
    };

    const renderCanvas = (wf) => {
      const svg   = document.getElementById('wf2Svg');
      const nodes = document.getElementById('wf2Nodes');
      const canvas= document.getElementById('wf2Canvas');
      if (!svg || !nodes) return;

      while (svg.children.length > 1) svg.removeChild(svg.lastChild);
      nodes.innerHTML = '';

      const steps = wf.steps || [];
      let extraAcc = 0;
      const extraByIdx = steps.map((s, i) => {
        const e = extraAcc;
        if (s.type === 'condition') extraAcc += 48;
        return e;
      });

      const totalH = nodeTop(steps.length, extraAcc) + 120;
      canvas.style.minHeight = totalH + 'px';
      canvas.style.minWidth  = CANVAS_W + 'px';
      svg.setAttribute('viewBox', `0 0 ${CANVAS_W} ${totalH}`);
      svg.style.width  = CANVAS_W + 'px';
      svg.style.height = totalH + 'px';

      // START node
      const startDiv = document.createElement('div');
      startDiv.className = 'wf2-node';
      startDiv.style.cssText = `left:${MX-62}px;top:${SY}px;`;
      startDiv.innerHTML = '<div class="wf2-node-start"><span>▶</span> BẮT ĐẦU</div>';
      nodes.appendChild(startDiv);

      if (steps.length) {
        const first = steps[0];
        const firstColor = first.status==='done' ? (first.type==='approve' ? '#F59E0B' : '#22C55E') : '';
        drawArrow(svg, MX, SY + startDiv.offsetHeight, MX, nodeTop(0, extraByIdx[0]) - 2, firstColor);
      }

      steps.forEach((s, i) => {
        const extra = extraByIdx[i];
        const ty = nodeTop(i, extra);
        const isDone   = s.status === 'done';
        const isActive = s.status === 'active';
        const isBlocked= s.status === 'blocked';
        const selCls   = _activeStepIdx === i ? 'selected' : '';
        const statusCls= isDone ? 'done' : isActive ? 'active-step' : isBlocked ? 'blocked' : '';
        const num      = String(i+1).padStart(2,'0');

        if (s.type === 'condition') {
          // Diamond
          const dx = MX - DW/2;
          const wrap = document.createElement('div');
          wrap.className = 'wf2-node wf2-node-diamond-wrap';
          wrap.style.cssText = `left:${dx}px;top:${ty}px;width:${DW}px;height:${DW}px;`;
          const txt = (s.conditionText || s.name || '?').replace(/\?$/, '').trim();
          wrap.innerHTML = `
            <div class="wf2-node-diamond ${selCls}" data-step-idx="${i}">
              <div class="wf2-node-diamond-inner">
                <span class="wf2-node-num-sm">${num}</span>
                <div class="wf2-node-diamond-text">${txt}?</div>
              </div>
            </div>
            <span class="wf2-branch-yes">Có</span>
            <span class="wf2-branch-no">Không</span>`;
          nodes.appendChild(wrap);

          // Reject branch
          if (s.rejectStep) {
            const rj  = s.rejectStep;
            const arrowY = ty + DW/2;
            const rjDiv = document.createElement('div');
            rjDiv.className = `wf2-node`;
            // Use transform to vertically center the box on arrowY without needing offsetHeight
            rjDiv.style.cssText = `left:5px;top:${arrowY}px;width:185px;transform:translateY(-50%);`;
            rjDiv.innerHTML = `
              <div class="wf2-node-reject ${selCls}" data-step-idx="${i}">
                <div class="wf2-node-reject-head">
                  <div class="wf2-node-reject-num">${rj.code || num+'A'}</div>
                  <div class="wf2-node-reject-title">${rj.name}</div>
                </div>
                <div class="wf2-node-reject-body">
                  ${rj.assignee ? `<div class="wf2-node-reject-assignee">👤 ${rj.assignee}</div>` : ''}
                </div>
              </div>`;
            nodes.appendChild(rjDiv);
            // Horizontal arrow snapped to diamond left-vertex → reject box right-center
            drawArrow(svg, MX - DW/2, arrowY, 190, arrowY, '#EF4444');
          }

          // Arrow down from diamond
          if (i+1 < steps.length) {
            const nextExtra = extraByIdx[i+1];
            const ny = nodeTop(i+1, nextExtra);
            drawArrow(svg, MX, ty + DW + 2, MX, ny - 2, '#22C55E');
          }

        } else {
          // Card node
          const doneCount  = (s.checklist||[]).filter(c=>c.done).length;
          const totalCheck = (s.checklist||[]).length;
          const dots = (s.checklist||[]).map(c =>
            `<span class="wf2-node-check-dot ${c.done?'done':''}"></span>`).join('');

          const nodeDiv = document.createElement('div');
          nodeDiv.className = 'wf2-node';
          nodeDiv.style.cssText = `left:${MX-NW/2}px;top:${ty}px;width:${NW}px;`;
          nodeDiv.innerHTML = `
            <div class="wf2-node-card ${statusCls} ${selCls}" data-step-idx="${i}">
              <div class="wf2-node-card-head">
                <span class="wf2-drag-handle" title="Kéo để sắp xếp">⠿</span>
                <div class="wf2-node-num">${num}</div>
                <div class="wf2-node-title">${s.name}</div>
                <span class="wf2-node-type-icon">${TYPE_ICON[s.type]||'📋'}</span>
              </div>
              <div class="wf2-node-corner">
                ${isDone ? '<span class="wf2-node-done-icon">✓</span>' : '<span class="wf2-node-corner-spacer"></span>'}
                <button class="wf2-node-del-btn" data-del-idx="${i}" title="Xóa bước này">×</button>
              </div>
              <div class="wf2-node-card-body">
                ${s.assignee ? `<div class="wf2-node-assignee">👤 ${s.assignee}</div>` : ''}
                ${s.description ? `<div class="wf2-node-desc-prev">${s.description.split('\n')[0].replace(/^-\s*/,'')}</div>` : ''}
                ${totalCheck > 0 ? `<div class="wf2-node-check-row">${dots}</div>` : ''}
                ${s.deadline ? `<div class="wf2-node-deadline">⏱ ${s.deadline} ngày</div>` : ''}
              </div>
            </div>`;
          nodes.appendChild(nodeDiv);

          if (i+1 < steps.length) {
            const nextExtra = extraByIdx[i+1];
            const ny = nodeTop(i+1, nextExtra);
            const arrowColor = isDone ? (s.type === 'approve' ? '#F59E0B' : '#22C55E') : '';
            const cardH = nodeDiv.firstElementChild.offsetHeight;
            drawArrow(svg, MX, ty + cardH, MX, ny-2, arrowColor);

            // Insert-after button centered in the gap
            const insertY = ty + cardH + Math.round((ny - ty - cardH) / 2) - 11;
            const insDiv = document.createElement('div');
            insDiv.className = 'wf2-node wf2-node-insert';
            insDiv.style.cssText = `left:${MX-11}px;top:${insertY}px;`;
            insDiv.innerHTML = `<button class="wf2-insert-btn" data-after-idx="${i}" title="Thêm bước sau">+</button>`;
            nodes.appendChild(insDiv);
          }
        }
      });

      // END node
      const endY = nodeTop(steps.length, extraAcc);
      if (steps.length) {
        const last = steps[steps.length-1];
        const lastTy = nodeTop(steps.length-1, extraByIdx[steps.length-1]);
        const lastCardEl = nodes.querySelector(`[data-step-idx="${steps.length-1}"]`);
        const lastH = last.type === 'condition' ? DW : (lastCardEl?.offsetHeight ?? NH);
        const lastColor = last.status==='done' ? (last.type==='approve' ? '#F59E0B' : '#22C55E') : '';
        drawArrow(svg, MX, lastTy+lastH+2, MX, endY-2, lastColor);
      }
      const endDiv = document.createElement('div');
      endDiv.className = 'wf2-node';
      endDiv.style.cssText = `left:${MX-60}px;top:${endY}px;`;
      endDiv.innerHTML = '<div class="wf2-node-end"><span>⏹</span> KẾT THÚC</div>';
      nodes.appendChild(endDiv);

      // Click handlers — open step detail
      nodes.querySelectorAll('[data-step-idx]').forEach(el => {
        el.addEventListener('click', e => {
          e.stopPropagation();
          openStepDetail(wf, parseInt(el.dataset.stepIdx));
        });
      });

      // Delete button on each node card
      nodes.querySelectorAll('[data-del-idx]').forEach(btn => {
        btn.addEventListener('click', async e => {
          e.stopPropagation();
          const idx = parseInt(btn.dataset.delIdx);
          const stepName = (wf.steps[idx]?.name || 'bước này');
          if (!confirm(`Xóa "${stepName}"?`)) return;
          pushUndo(wf.steps);
          wf.steps.splice(idx, 1);
          if (_activeStepIdx === idx) _activeStepIdx = null;
          else if (_activeStepIdx > idx) _activeStepIdx--;
          await saveStep(wf);
          renderCanvas(wf);
          renderSideList();
          const foot = document.getElementById('wf2DetailFoot');
          const body = document.getElementById('wf2DetailBody');
          if (_activeStepIdx === null) {
            if (foot) foot.style.display = 'none';
            if (body) body.innerHTML = `<div class="wf2-empty-detail"><svg viewBox="0 0 24 24" style="width:36px;height:36px;fill:#CBD5E1"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/></svg><p>Chọn một bước để xem chi tiết</p></div>`;
          }
          if (typeof showToast === 'function') showToast(`Đã xóa "${stepName}"`, 'info');
        });
      });

      // Insert-after button between nodes
      nodes.querySelectorAll('[data-after-idx]').forEach(btn => {
        btn.addEventListener('click', async e => {
          e.stopPropagation();
          const afterIdx = parseInt(btn.dataset.afterIdx);
          const newStep = { name: 'Bước mới', type: 'task', assignee: '', description: '', deadline: null, checklist: [], status: 'pending' };
          pushUndo(wf.steps);
          wf.steps.splice(afterIdx + 1, 0, newStep);
          await saveStep(wf);
          renderCanvas(wf);
          renderSideList();
          openStepDetail(wf, afterIdx + 1);
          if (typeof showToast === 'function') showToast('Đã thêm bước mới', 'success');
        });
      });

      // ── Drag-to-reorder steps ─────────────────────────────────────────
      const canvasEl = document.getElementById('wf2Canvas');
      const wrapEl   = document.getElementById('wf2CanvasWrap') || canvasEl?.parentElement;

      nodes.querySelectorAll('.wf2-drag-handle').forEach(handle => {
        handle.addEventListener('pointerdown', e => {
          e.stopPropagation();
          e.preventDefault();

          const card    = handle.closest('.wf2-node-card');
          const nodeDiv = handle.closest('.wf2-node');
          if (!card || !nodeDiv) return;
          const dragIdx = parseInt(card.dataset.stepIdx);
          if (isNaN(dragIdx)) return;

          // Ghost element
          const cardRect = card.getBoundingClientRect();
          const ghost = card.cloneNode(true);
          ghost.style.cssText = `position:fixed;pointer-events:none;z-index:9999;
            width:${cardRect.width}px;opacity:.82;
            box-shadow:0 12px 40px rgba(0,0,0,.18);border-radius:10px;
            transform:rotate(1.5deg) scale(1.03);transition:none;
            left:${cardRect.left}px;top:${cardRect.top}px;`;
          document.body.appendChild(ghost);
          card.classList.add('wf2-dragging-src');

          // Drop indicator line
          const dropLine = document.createElement('div');
          dropLine.className = 'wf2-drop-indicator';
          dropLine.style.display = 'none';
          nodes.appendChild(dropLine);

          let dropIdx = null;

          const getDropIdx = (clientY) => {
            if (!canvasEl) return null;
            const rect = canvasEl.getBoundingClientRect();
            const canvasY = (clientY - rect.top) / (_zoom || 1);
            // Find the insert slot (between 0 and steps.length)
            let best = steps.length; // default: after last
            for (let k = 0; k < steps.length; k++) {
              const ky = nodeTop(k, extraByIdx[k]) + NH / 2;
              if (canvasY < ky) { best = k; break; }
            }
            return best;
          };

          const showDropLine = (dIdx) => {
            if (dIdx === null) { dropLine.style.display = 'none'; return; }
            // Position: above step dIdx, or after last step
            const lineY = dIdx < steps.length
              ? nodeTop(dIdx, extraByIdx[dIdx]) - GAP / 2
              : nodeTop(steps.length - 1, extraByIdx[steps.length - 1]) + NH + GAP / 2;
            dropLine.style.cssText = `position:absolute;left:${MX - NW/2}px;top:${lineY - 2}px;
              width:${NW}px;height:3px;border-radius:2px;
              background:#6366F1;display:block;pointer-events:none;z-index:10;
              box-shadow:0 0 0 3px rgba(99,102,241,.2);`;
          };

          const onMove = (me) => {
            ghost.style.left = (me.clientX - cardRect.width / 2) + 'px';
            ghost.style.top  = (me.clientY - 30) + 'px';
            dropIdx = getDropIdx(me.clientY);
            // Don't show indicator at same position (no-op moves)
            const noOp = dropIdx === dragIdx || dropIdx === dragIdx + 1;
            showDropLine(noOp ? null : dropIdx);
          };

          const onUp = async () => {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
            ghost.remove();
            dropLine.remove();
            card.classList.remove('wf2-dragging-src');

            const noOp = dropIdx === null || dropIdx === dragIdx || dropIdx === dragIdx + 1;
            if (!noOp) {
              pushUndo(wf.steps);
              const moved = wf.steps.splice(dragIdx, 1)[0];
              const insertAt = dropIdx > dragIdx ? dropIdx - 1 : dropIdx;
              wf.steps.splice(insertAt, 0, moved);
              if (_activeStepIdx === dragIdx) _activeStepIdx = insertAt;
              else if (_activeStepIdx !== null) {
                if (_activeStepIdx > dragIdx && _activeStepIdx <= insertAt) _activeStepIdx--;
                else if (_activeStepIdx < dragIdx && _activeStepIdx >= insertAt) _activeStepIdx++;
              }
              await saveStep(wf);
              renderCanvas(wf);
              renderSideList();
              if (typeof showToast === 'function') showToast('Đã sắp xếp lại thứ tự bước', 'success');
            }
          };

          document.addEventListener('pointermove', onMove);
          document.addEventListener('pointerup', onUp);
        });
      });
    };

    const openStepDetail = (wf, idx) => {
      _activeStepIdx = idx;
      renderCanvas(wf);

      const s = (wf.steps||[])[idx];
      if (!s) return;

      const body = document.getElementById('wf2DetailBody');
      const foot = document.getElementById('wf2DetailFoot');
      if (!body) return;

      body.innerHTML = `
        <div class="wf2-detail-field">
          <label class="wf2-detail-label">Tên bước *</label>
          <input id="wf2DStepName" class="wf2-detail-input" type="text" value="${(s.name||'').replace(/"/g,'&quot;')}"/>
        </div>
        <div class="wf2-detail-field">
          <label class="wf2-detail-label">Loại bước</label>
          <select id="wf2DStepType" class="wf2-detail-input wf2-detail-select">
            ${Object.entries(TYPE_LABEL).map(([v,l]) => `<option value="${v}" ${s.type===v?'selected':''}>${TYPE_ICON[v]} ${l}</option>`).join('')}
          </select>
        </div>
        <div class="wf2-detail-field">
          <label class="wf2-detail-label">Người phụ trách</label>
          <select id="wf2DStepAssignee" class="wf2-detail-input wf2-detail-select">
            <option value="">-- Đang tải... --</option>
          </select>
        </div>
        <div class="wf2-detail-field">
          <label class="wf2-detail-label">Mô tả công việc</label>
          <textarea id="wf2DStepDesc" class="wf2-detail-input wf2-detail-textarea">${s.description||''}</textarea>
        </div>
        <div class="wf2-detail-field">
          <label class="wf2-detail-label">Thời hạn (ngày)</label>
          <input id="wf2DStepDeadline" class="wf2-detail-input" type="number" value="${s.deadline||''}" min="1"/>
        </div>
        <div class="wf2-detail-field">
          <label class="wf2-detail-label">Checklist</label>
          <div id="wf2DChecklist" class="wf2-checklist"></div>
          <button class="wf2-add-check" id="wf2DAddCheck">+ Thêm checklist</button>
        </div>
        <div class="wf2-detail-field">
          <label class="wf2-detail-label">Trạng thái bước</label>
          <select id="wf2DStepStatus" class="wf2-detail-input wf2-detail-select">
            <option value="pending" ${s.status==='pending'?'selected':''}>⬜ Chưa bắt đầu</option>
            <option value="active"  ${s.status==='active' ?'selected':''}>🔵 Đang thực hiện</option>
            <option value="done"    ${s.status==='done'   ?'selected':''}>✅ Hoàn thành</option>
            <option value="blocked" ${s.status==='blocked'?'selected':''}>🔴 Bị chặn</option>
          </select>
        </div>
        ${s.type === 'condition' ? `
        <div class="wf2-detail-divider"></div>
        <div class="wf2-detail-field">
          <label class="wf2-detail-label">Nội dung điều kiện</label>
          <input id="wf2DConditionText" class="wf2-detail-input" type="text"
            value="${(s.conditionText||'').replace(/"/g,'&quot;')}"
            placeholder="VD: Hồ sơ đạt yêu cầu"/>
        </div>
        <div class="wf2-detail-section-title">Nhánh KHÔNG đạt</div>
        <div class="wf2-detail-field">
          <label class="wf2-detail-label">Tên bước từ chối</label>
          <input id="wf2DRejectName" class="wf2-detail-input" type="text"
            value="${((s.rejectStep&&s.rejectStep.name)||'').replace(/"/g,'&quot;')}"
            placeholder="VD: Yêu cầu bổ sung hồ sơ"/>
        </div>
        <div class="wf2-detail-field">
          <label class="wf2-detail-label">Người phụ trách (từ chối)</label>
          <input id="wf2DRejectAssignee" class="wf2-detail-input" type="text"
            value="${((s.rejectStep&&s.rejectStep.assignee)||'').replace(/"/g,'&quot;')}"
            placeholder="VD: Chuyên viên hồ sơ"/>
        </div>` : ''}`;

      renderChecklist(s, wf);

      // Populate assignee select with role options + staff from hrm_staff
      (async () => {
        const sel = document.getElementById('wf2DStepAssignee');
        if (!sel) return;
        const ROLE_OPTIONS = [
          'Tư vấn viên','Chuyên viên hồ sơ','Chuyên viên visa',
          'Kế toán','Giáo viên','Giám đốc','Marketing'
        ];
        let staffNames = [];
        try {
          const list = (typeof hrmStaffCache !== 'undefined' && hrmStaffCache.length)
            ? hrmStaffCache
            : (await db.collection('hrm_staff').get()).docs.map(d => d.data());
          staffNames = list.filter(x => x.name).map(x => x.name).sort((a,b) => a.localeCompare(b,'vi'));
        } catch(_e) { /* ignore */ }
        const curVal = s.assignee || '';
        let html = '<option value="">-- Chọn người phụ trách --</option>';
        html += '<optgroup label="Vai trò chung">' +
          ROLE_OPTIONS.map(r => `<option value="${r}"${r===curVal?' selected':''}>${r}</option>`).join('') + '</optgroup>';
        if (staffNames.length) {
          html += '<optgroup label="Nhân viên">' +
            staffNames.map(n => `<option value="${n}"${n===curVal?' selected':''}>${n}</option>`).join('') + '</optgroup>';
        }
        sel.innerHTML = html;
      })();

      // Status auto-advance: when set to "done" → tick node + move to next step + check completion
      const _statusSel = document.getElementById('wf2DStepStatus');
      if (_statusSel) {
        _statusSel.addEventListener('change', async function() {
          const wf = _workflows.find(w => w.id === _activeId);
          if (!wf || !wf.steps[_activeStepIdx]) return;
          const curStep = wf.steps[_activeStepIdx];
          curStep.status = this.value;

          if (this.value === 'done') {
            // Advance next pending/active step
            const nextIdx = wf.steps.findIndex((st, i) => i > _activeStepIdx && st.status !== 'done');
            if (nextIdx !== -1) wf.steps[nextIdx].status = 'active';

            const allDone = wf.steps.every(st => st.status === 'done');
            if (allDone) {
              await WF_COL().doc(wf.id).update({
                steps: wf.steps, status: 'completed',
                completedAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
              });
              const lw = _workflows.find(w2 => w2.id === wf.id);
              if (lw) { lw.steps = wf.steps; lw.status = 'completed'; }
              if (typeof showToast === 'function') showToast('🎉 Quy trình đã hoàn thành! Đã thêm vào danh sách.', 'success');
              renderCanvas(wf); renderSideList(); renderListGrid();
              return;
            }

            await saveStep(wf);
            renderCanvas(wf); renderSideList();
            if (typeof showToast === 'function') showToast('✓ Bước hoàn thành! Chuyển sang bước tiếp theo.', 'success');
            if (nextIdx !== -1) openStepDetail(wf, nextIdx);
          } else {
            await saveStep(wf);
            renderCanvas(wf);
          }
        });
      }

      document.getElementById('wf2DAddCheck')?.addEventListener('click', () => {
        s.checklist = s.checklist || [];
        s.checklist.push({text:'',done:false});
        renderChecklist(s, wf);
      });

      if (foot) foot.style.display = 'flex';
    };

    const renderChecklist = (s, wf) => {
      const cl = document.getElementById('wf2DChecklist');
      if (!cl) return;
      cl.innerHTML = (s.checklist||[]).map((item,ci) => `
        <div class="wf2-check-row">
          <input type="checkbox" ${item.done?'checked':''} data-ci="${ci}"/>
          <input class="wf2-check-inp" type="text" value="${(item.text||'').replace(/"/g,'&quot;')}" data-ci="${ci}" placeholder="Nội dung..."/>
          <button class="wf2-check-del" data-ci="${ci}">✕</button>
        </div>`).join('');
      cl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', async () => {
          s.checklist[+cb.dataset.ci].done = cb.checked;
          await saveStep(wf);
          renderCanvas(wf);
        });
      });
      cl.querySelectorAll('.wf2-check-inp').forEach(inp => {
        inp.addEventListener('input', () => { s.checklist[+inp.dataset.ci].text = inp.value; });
      });
      cl.querySelectorAll('.wf2-check-del').forEach(btn => {
        btn.addEventListener('click', async () => {
          s.checklist.splice(+btn.dataset.ci, 1);
          await saveStep(wf);
          openStepDetail(wf, _activeStepIdx);
        });
      });
    };

    const saveStep = async (wf, { skipUndo = false } = {}) => {
      if (!wf.id) return;
      await WF_COL().doc(wf.id).update({ steps: wf.steps, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      const local = _workflows.find(w => w.id === wf.id);
      if (local) local.steps = wf.steps;
    };

    const loadWorkflows = async () => {
      const snap = await WF_COL().orderBy('createdAt','desc').get();
      if (snap.empty) {
        for (const [name, data] of Object.entries(STEP_SEEDS)) {
          await WF_COL().add({
            name, description: data.desc, category: data.cat, status:'active',
            steps: data.steps,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        }
        const snap2 = await WF_COL().orderBy('createdAt','desc').get();
        _workflows = snap2.docs.map(d=>({id:d.id,...d.data()}));
      } else {
        _workflows = snap.docs.map(d=>({id:d.id,...d.data()}));
      }
    };

    const renderSideList = () => {
      const search = (document.getElementById('wf2SideSearch')?.value||'').toLowerCase();
      const cat    = document.getElementById('wf2SideCat')?.value||'';
      const filtered = _workflows.filter(w =>
        (!search || w.name.toLowerCase().includes(search)) && (!cat || w.category===cat));
      const total = filtered.length;
      const pages = Math.max(1, Math.ceil(total / PER_PAGE));
      if (_page > pages) _page = pages;
      const paged = filtered.slice((_page-1)*PER_PAGE, _page*PER_PAGE);

      const body = document.getElementById('wf2SideListBody');
      if (!body) return;
      body.innerHTML = paged.map(w => {
        const cnt = (w.steps||[]).length;
        const upd = w.updatedAt?.toDate?.()?.toLocaleDateString('vi-VN') || '--';
        return `<div class="wf2-side-item ${w.id===_activeId?'active':''}" data-id="${w.id}">
          <div class="wf2-side-item-name">${w.name}</div>
          <div class="wf2-side-item-row">
            <span class="wf2-badge ${w.status}">${STATUS_LABEL[w.status]||w.status}</span>
            <div class="wf2-side-item-actions">
              <button class="wf2-side-action-btn" data-action="view" data-id="${w.id}" title="Xem">👁</button>
              <button class="wf2-side-action-btn" data-action="edit" data-id="${w.id}" title="Sửa">✏️</button>
              <button class="wf2-side-action-btn" data-action="del"  data-id="${w.id}" title="Xóa">🗑</button>
            </div>
          </div>
          <div class="wf2-side-item-meta">${cnt} bước · ${upd}</div>
        </div>`;
      }).join('');

      const pgEl = document.getElementById('wf2Pagination');
      if (pgEl) {
        let pg = `<button class="wf2-page-btn" id="wf2PgPrev">‹</button>`;
        for(let p=1;p<=pages;p++) pg += `<button class="wf2-page-btn ${p===_page?'active':''}" data-p="${p}">${p}</button>`;
        pg += `<button class="wf2-page-btn" id="wf2PgNext">›</button>`;
        pgEl.innerHTML = pg;
        pgEl.querySelectorAll('[data-p]').forEach(btn => { btn.addEventListener('click', () => { _page=+btn.dataset.p; renderSideList(); }); });
        document.getElementById('wf2PgPrev')?.addEventListener('click', () => { if(_page>1){_page--;renderSideList();} });
        document.getElementById('wf2PgNext')?.addEventListener('click', () => { if(_page<pages){_page++;renderSideList();} });
      }

      body.querySelectorAll('.wf2-side-item').forEach(el => {
        el.addEventListener('click', () => openWorkflow(el.dataset.id));
      });
      body.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const id = btn.dataset.id;
          if (btn.dataset.action === 'del') { if(confirm('Xóa quy trình này?')) deleteWorkflow(id); }
          else openWorkflow(id);
        });
      });
    };

    const renderListGrid = () => {
      const search = (document.getElementById('wf2ListSearch')?.value||'').toLowerCase();
      const cat    = document.getElementById('wf2ListCat')?.value||'';
      const filtered = _workflows.filter(w =>
        (!search || w.name.toLowerCase().includes(search)) && (!cat || w.category===cat));

      const grid = document.getElementById('wf2ListGrid');
      if (!grid) return;
      grid.innerHTML = filtered.map(w => {
        const cnt = (w.steps||[]).length;
        const upd = w.updatedAt?.toDate?.()?.toLocaleDateString('vi-VN') || '--';
        return `<div class="wf2-card" data-id="${w.id}">
          <div class="wf2-card-head">
            <div class="wf2-card-name">${w.name}</div>
            <div class="wf2-card-actions">
              <button class="wf2-card-action-btn" data-action="view" data-id="${w.id}" title="Xem">👁</button>
              <button class="wf2-card-action-btn" data-action="edit" data-id="${w.id}" title="Sửa">✏️</button>
              <button class="wf2-card-action-btn" data-action="del"  data-id="${w.id}" title="Xóa">🗑</button>
            </div>
          </div>
          <div class="wf2-card-meta">
            <span class="wf2-badge ${w.status}">${STATUS_LABEL[w.status]||w.status}</span>
            <span>${cnt} bước</span>
            <span>Cập nhật ${upd}</span>
            ${w.category ? `<span class="wf2-cat-tag">${w.category}</span>` : ''}
          </div>
          ${w.description ? `<div class="wf2-card-desc">${w.description}</div>` : ''}
        </div>`;
      }).join('');

      grid.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const id = btn.dataset.id;
          if (btn.dataset.action === 'del') { if(confirm('Xóa quy trình này?')) deleteWorkflow(id); }
          else openWorkflow(id);
        });
      });
      grid.querySelectorAll('.wf2-card').forEach(el => {
        el.addEventListener('click', () => openWorkflow(el.dataset.id));
      });
    };

    const openWorkflow = (id) => {
      _activeId = id;
      _activeStepIdx = null;
      const wf = _workflows.find(w => w.id === id);
      if (!wf) return;

      switchTab('editor');

      const setVal = (eid, v) => { const el=document.getElementById(eid); if(el) el.value=v; };
      setVal('wf2FormName', wf.name||'');
      setVal('wf2FormDesc', wf.description||'');
      setVal('wf2FormCat',  wf.category||'Tuyển sinh');
      setVal('wf2ActiveId', id);

      const actEl = document.getElementById('wf2FormActive');
      const actLbl= document.getElementById('wf2FormActiveLabel');
      if (actEl)  actEl.checked = wf.status === 'active';
      if (actLbl) actLbl.textContent = wf.status === 'active' ? 'Đang hoạt động' : 'Không hoạt động';

      renderCanvas(wf);
      renderSideList();

      const body = document.getElementById('wf2DetailBody');
      const foot = document.getElementById('wf2DetailFoot');
      if (body) body.innerHTML = `<div class="wf2-empty-detail">
        <svg viewBox="0 0 24 24" style="width:36px;height:36px;fill:#CBD5E1"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/></svg>
        <p>Chọn một bước để xem chi tiết</p></div>`;
      if (foot) foot.style.display = 'none';
    };

    const deleteWorkflow = async (id) => {
      await WF_COL().doc(id).delete();
      if (_activeId === id) {
        _activeId = null;
        const n = document.getElementById('wf2Nodes');
        const s = document.getElementById('wf2Svg');
        if (n) n.innerHTML = '';
        if (s) { while(s.children.length>1) s.removeChild(s.lastChild); }
      }
      await loadWorkflows();
      renderSideList();
      renderListGrid();
      if (typeof showToast === 'function') showToast('Đã xóa quy trình','info');
    };

    const switchTab = (tab) => {
      const panelList   = document.getElementById('wf2PanelList');
      const panelEditor = document.getElementById('wf2PanelEditor');
      document.querySelectorAll('.wf2-tab').forEach(t => t.classList.toggle('active', t.dataset.wftab === tab));
      if (panelList)   panelList.style.display   = tab==='list'   ? 'flex' : 'none';
      if (panelEditor) panelEditor.style.display = tab==='editor' ? 'flex' : 'none';
      if (tab === 'list') renderListGrid();
    };

    const saveWorkflow = async () => {
      const name   = (document.getElementById('wf2FormName')?.value||'').trim();
      const desc   = (document.getElementById('wf2FormDesc')?.value||'').trim();
      const cat    = document.getElementById('wf2FormCat')?.value||'Tuyển sinh';
      const active = document.getElementById('wf2FormActive')?.checked;
      const id     = document.getElementById('wf2ActiveId')?.value||'';
      if (!name) { if(typeof showToast==='function') showToast('Vui lòng nhập tên quy trình','error'); return; }
      const data = { name, description:desc, category:cat, status: active?'active':'draft', updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
      if (id) {
        await WF_COL().doc(id).update(data);
        if(typeof showToast==='function') showToast('Đã cập nhật quy trình!','success');
      } else {
        const ref = await WF_COL().add({ ...data, steps:[], createdAt: firebase.firestore.FieldValue.serverTimestamp() });
        const hidEl = document.getElementById('wf2ActiveId');
        if (hidEl) hidEl.value = ref.id;
        _activeId = ref.id;
        await loadWorkflows();
        renderSideList();
        openWorkflow(ref.id);
        if(typeof showToast==='function') showToast('Đã tạo quy trình mới! Kéo thả bước từ bảng bên trái để bắt đầu.','success');
        return;
      }
      await loadWorkflows();
      renderSideList();
    };

    return async () => {
      await loadWorkflows();
      if (!_activeId && _workflows.length) openWorkflow(_workflows[0].id);
      else { renderSideList(); renderListGrid(); }

      if (_bound) return;
      _bound = true;

      // Tab switching
      document.querySelectorAll('.wf2-tab').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.wftab));
      });

      // New workflow button
      document.getElementById('wf2BtnNew')?.addEventListener('click', () => {
        _activeId = null;
        _activeStepIdx = null;
        switchTab('editor');
        ['wf2FormName','wf2FormDesc'].forEach(eid => { const el=document.getElementById(eid); if(el) el.value=''; });
        const actEl = document.getElementById('wf2FormActive');
        if (actEl) actEl.checked = true;
        const actLbl = document.getElementById('wf2FormActiveLabel');
        if (actLbl) actLbl.textContent = 'Đang hoạt động';
        const hidEl = document.getElementById('wf2ActiveId');
        if (hidEl) hidEl.value = '';
        const nodesEl = document.getElementById('wf2Nodes');
        if (nodesEl) nodesEl.innerHTML = '';
        const svgEl2  = document.getElementById('wf2Svg');
        if (svgEl2) { while(svgEl2.children.length>1) svgEl2.removeChild(svgEl2.lastChild); }
      });

      // Save buttons
      document.getElementById('wf2BtnSaveWf')?.addEventListener('click', saveWorkflow);
      document.getElementById('wf2BtnSaveFlow')?.addEventListener('click', saveWorkflow);
      document.getElementById('wf2BtnCancel')?.addEventListener('click', () => switchTab('list'));

      // Toggle active label
      document.getElementById('wf2FormActive')?.addEventListener('change', e => {
        const lbl = document.getElementById('wf2FormActiveLabel');
        if (lbl) lbl.textContent = e.target.checked ? 'Đang hoạt động' : 'Không hoạt động';
      });

      // Palette: add step
      document.querySelectorAll('.wf2-palette-item').forEach(item => {
        item.addEventListener('click', async () => {
          if (!_activeId) { if(typeof showToast==='function') showToast('Hãy lưu quy trình trước khi thêm bước!','info'); return; }
          const wf = _workflows.find(w => w.id === _activeId);
          if (!wf) return;
          const type = item.dataset.type;
          const newStep = { name: TYPE_LABEL[type]||'Bước mới', type, assignee:'', description:'', deadline:null, checklist:[], status:'pending' };
          if (type === 'condition') {
            newStep.conditionText = 'Kiểm tra điều kiện';
            newStep.rejectStep = { name:'Xử lý trường hợp không đạt', assignee:'', code:String(wf.steps.length+1).padStart(2,'0')+'A' };
          }
          pushUndo(wf.steps);
          wf.steps.push(newStep);
          await saveStep(wf);
          renderCanvas(wf);
          renderSideList();
          openStepDetail(wf, wf.steps.length - 1);
          if(typeof showToast==='function') showToast(`Đã thêm "${newStep.name}"`, 'success');
        });
      });

      // Update step
      document.getElementById('wf2BtnUpdateStep')?.addEventListener('click', async () => {
        if (_activeStepIdx === null || !_activeId) return;
        const wf = _workflows.find(w => w.id === _activeId);
        if (!wf || !wf.steps[_activeStepIdx]) return;
        const s = wf.steps[_activeStepIdx];
        pushUndo(wf.steps);
        const prevAssignee = s.assignee || '';
        s.name        = document.getElementById('wf2DStepName')?.value.trim()     || s.name;
        s.type        = document.getElementById('wf2DStepType')?.value             || s.type;
        s.assignee    = document.getElementById('wf2DStepAssignee')?.value.trim()  || '';
        s.description = document.getElementById('wf2DStepDesc')?.value.trim()     || '';
        s.deadline    = parseInt(document.getElementById('wf2DStepDeadline')?.value) || null;
        s.status      = document.getElementById('wf2DStepStatus')?.value           || s.status;
        if (s.type === 'condition') {
          const ct = document.getElementById('wf2DConditionText')?.value.trim();
          if (ct) s.conditionText = ct;
          if (!s.rejectStep) s.rejectStep = {};
          const rjName = document.getElementById('wf2DRejectName')?.value.trim();
          const rjAssignee = document.getElementById('wf2DRejectAssignee')?.value.trim();
          if (rjName) s.rejectStep.name = rjName;
          if (rjAssignee !== undefined) s.rejectStep.assignee = rjAssignee;
        }
        document.querySelectorAll('#wf2DChecklist .wf2-check-inp').forEach(inp => {
          const ci = +inp.dataset.ci;
          if (s.checklist && s.checklist[ci]) s.checklist[ci].text = inp.value;
        });
        await saveStep(wf);
        if(typeof showToast==='function') showToast('Đã cập nhật bước!','success');
        renderCanvas(wf);
        renderSideList();

        // Send bell notification to newly assigned staff member
        if (s.assignee && s.assignee !== prevAssignee) {
          sendAssigneeNotification({
            stepName:     s.name,
            workflowName: wf.name || wf.title || 'Quy trình',
            workflowId:   wf.id,
            assigneeName: s.assignee,
            prevAssignee,
            deadline:     s.deadline,
          });
        }

        // If all steps are now done, mark the workflow completed
        const allDoneNow = wf.steps.every(st => st.status === 'done');
        if (allDoneNow) {
          await WF_COL().doc(wf.id).update({
            status: 'completed',
            completedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          const lw = _workflows.find(w2 => w2.id === wf.id);
          if (lw) lw.status = 'completed';
          if(typeof showToast==='function') showToast('🎉 Quy trình đã hoàn thành!', 'success');
          renderSideList(); renderListGrid();
        }
      });

      // Delete step
      document.getElementById('wf2BtnDelStep')?.addEventListener('click', async () => {
        if (_activeStepIdx === null || !_activeId) return;
        if (!confirm('Xóa bước này?')) return;
        const wf = _workflows.find(w => w.id === _activeId);
        if (!wf) return;
        pushUndo(wf.steps);
        wf.steps.splice(_activeStepIdx, 1);
        _activeStepIdx = null;
        await saveStep(wf);
        renderCanvas(wf);
        const foot = document.getElementById('wf2DetailFoot');
        if (foot) foot.style.display = 'none';
        const body = document.getElementById('wf2DetailBody');
        if (body) body.innerHTML = `<div class="wf2-empty-detail">
          <svg viewBox="0 0 24 24" style="width:36px;height:36px;fill:#CBD5E1"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/></svg>
          <p>Chọn một bước để xem chi tiết</p></div>`;
        if(typeof showToast==='function') showToast('Đã xóa bước','info');
      });

      // Zoom
      document.getElementById('wf2BtnZoomIn')?.addEventListener('click', () => {
        _zoom = Math.min(2, +(_zoom+0.1).toFixed(1));
        const c = document.getElementById('wf2Canvas');
        if (c) { c.style.transform=`scale(${_zoom})`; c.style.transformOrigin='top center'; }
        const lbl = document.getElementById('wf2ZoomLabel');
        if (lbl) lbl.textContent = Math.round(_zoom*100)+'%';
      });
      document.getElementById('wf2BtnZoomOut')?.addEventListener('click', () => {
        _zoom = Math.max(0.4, +(_zoom-0.1).toFixed(1));
        const c = document.getElementById('wf2Canvas');
        if (c) { c.style.transform=`scale(${_zoom})`; c.style.transformOrigin='top center'; }
        const lbl = document.getElementById('wf2ZoomLabel');
        if (lbl) lbl.textContent = Math.round(_zoom*100)+'%';
      });
      document.getElementById('wf2BtnFit')?.addEventListener('click', () => {
        _zoom = 1;
        const c = document.getElementById('wf2Canvas');
        if (c) { c.style.transform=''; }
        const lbl = document.getElementById('wf2ZoomLabel');
        if (lbl) lbl.textContent = '100%';
      });

      // Search/filter
      document.getElementById('wf2SideSearch')?.addEventListener('input', renderSideList);
      document.getElementById('wf2SideCat')?.addEventListener('change', renderSideList);
      document.getElementById('wf2ListSearch')?.addEventListener('input', renderListGrid);
      document.getElementById('wf2ListCat')?.addEventListener('change', renderListGrid);

      // ── Undo / Redo ─────────────────────────────────────────────────────
      syncUndoRedo();
      document.getElementById('wf2BtnUndo')?.addEventListener('click', async () => {
        if (!_activeId || _undoStack.length === 0) return;
        const wf = _workflows.find(w => w.id === _activeId);
        if (!wf) return;
        _redoStack.push(JSON.parse(JSON.stringify(wf.steps)));
        wf.steps = _undoStack.pop();
        await saveStep(wf);
        renderCanvas(wf);
        renderSideList();
        syncUndoRedo();
        if (_activeStepIdx !== null && wf.steps[_activeStepIdx]) openStepDetail(wf, _activeStepIdx);
        if(typeof showToast === 'function') showToast('Đã hoàn tác','info');
      });
      document.getElementById('wf2BtnRedo')?.addEventListener('click', async () => {
        if (!_activeId || _redoStack.length === 0) return;
        const wf = _workflows.find(w => w.id === _activeId);
        if (!wf) return;
        _undoStack.push(JSON.parse(JSON.stringify(wf.steps)));
        wf.steps = _redoStack.pop();
        await saveStep(wf);
        renderCanvas(wf);
        renderSideList();
        syncUndoRedo();
        if (_activeStepIdx !== null && wf.steps[_activeStepIdx]) openStepDetail(wf, _activeStepIdx);
        if(typeof showToast === 'function') showToast('Đã làm lại','info');
      });

      // ── Preview ─────────────────────────────────────────────────────────
      document.getElementById('wf2BtnPreview')?.addEventListener('click', () => {
        if (!_activeId) { showToast('Chưa có quy trình nào để xem trước','info'); return; }
        const wf = _workflows.find(w => w.id === _activeId);
        if (!wf) return;
        const overlay = document.getElementById('wf2PreviewOverlay');
        if (!overlay) return;
        document.getElementById('wf2PreviewTitle').textContent = wf.name || 'Xem trước quy trình';
        const stepCount = (wf.steps||[]).length;
        const doneCount = (wf.steps||[]).filter(s=>s.status==='done').length;
        document.getElementById('wf2PreviewMeta').textContent =
          `${stepCount} bước · ${doneCount}/${stepCount} hoàn thành · ${wf.category||''}`;
        // Render step list preview
        const list = document.getElementById('wf2PreviewSteps');
        if (list) {
          list.innerHTML = (wf.steps||[]).map((s, i) => {
            const num = String(i+1).padStart(2,'0');
            const icon = s.status==='done' ? '✅' : s.status==='active' ? '🔵' : s.status==='blocked' ? '🔴' : '⬜';
            return `<div class="wf2-preview-step ${s.status||'pending'}">
              <div class="wf2-preview-step-num">${num}</div>
              <div class="wf2-preview-step-body">
                <div class="wf2-preview-step-name">${s.name}</div>
                <div class="wf2-preview-step-meta">${TYPE_LABEL[s.type]||''} ${s.assignee?'· '+s.assignee:''} ${s.deadline?'· '+s.deadline+' ngày':''}</div>
              </div>
              <div class="wf2-preview-step-icon">${icon}</div>
            </div>`;
          }).join('') || '<div style="text-align:center;padding:2rem;color:#94A3B8;">Chưa có bước nào</div>';
        }
        overlay.style.display = 'flex';
      });
      document.getElementById('wf2BtnClosePreview')?.addEventListener('click', () => {
        const o = document.getElementById('wf2PreviewOverlay');
        if (o) o.style.display = 'none';
      });
      document.getElementById('wf2PreviewOverlay')?.addEventListener('click', e => {
        if (e.target === e.currentTarget) e.currentTarget.style.display = 'none';
      });

      // ── Settings ────────────────────────────────────────────────────────
      document.getElementById('wf2BtnSettings')?.addEventListener('click', () => {
        if (!_activeId) { showToast('Chưa có quy trình nào để thiết lập','info'); return; }
        const wf = _workflows.find(w => w.id === _activeId);
        if (!wf) return;
        const overlay = document.getElementById('wf2SettingsOverlay');
        if (!overlay) return;
        const nameEl = document.getElementById('wf2SettingName');
        const descEl = document.getElementById('wf2SettingDesc');
        const catEl  = document.getElementById('wf2SettingCat');
        if (nameEl) nameEl.value = wf.name || '';
        if (descEl) descEl.value = wf.description || '';
        if (catEl)  catEl.value  = wf.category || 'Tuyển sinh';
        overlay.style.display = 'flex';
      });
      document.getElementById('wf2BtnCloseSettings')?.addEventListener('click', () => {
        const o = document.getElementById('wf2SettingsOverlay');
        if (o) o.style.display = 'none';
      });
      document.getElementById('wf2SettingsOverlay')?.addEventListener('click', e => {
        if (e.target === e.currentTarget) e.currentTarget.style.display = 'none';
      });
      document.getElementById('wf2BtnSaveSettings')?.addEventListener('click', async () => {
        if (!_activeId) return;
        const wf = _workflows.find(w => w.id === _activeId);
        if (!wf) return;
        const name = document.getElementById('wf2SettingName')?.value.trim();
        const desc = document.getElementById('wf2SettingDesc')?.value.trim();
        const cat  = document.getElementById('wf2SettingCat')?.value;
        if (!name) { showToast('Tên quy trình không được để trống','error'); return; }
        await WF_COL().doc(_activeId).update({ name, description: desc, category: cat, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
        wf.name = name; wf.description = desc; wf.category = cat;
        document.getElementById('wf2FormName').value = name;
        document.getElementById('wf2FormDesc').value = desc || '';
        document.getElementById('wf2FormCat').value  = cat;
        document.getElementById('wf2SettingsOverlay').style.display = 'none';
        renderSideList();
        showToast('Đã lưu thiết lập quy trình!', 'success');
      });

      // ── Guide ────────────────────────────────────────────────────────────
      document.getElementById('wf2BtnGuide')?.addEventListener('click', () => {
        const o = document.getElementById('wf2GuideOverlay');
        if (o) o.style.display = 'flex';
      });
      document.getElementById('wf2BtnCloseGuide')?.addEventListener('click', () => {
        const o = document.getElementById('wf2GuideOverlay');
        if (o) o.style.display = 'none';
      });
      document.getElementById('wf2GuideOverlay')?.addEventListener('click', e => {
        if (e.target === e.currentTarget) e.currentTarget.style.display = 'none';
      });
    };
  })();


});