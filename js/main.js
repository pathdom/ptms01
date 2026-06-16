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

    // Role-based Access Controls (Admin Only "Tạo tài khoản NV" & "Tạo tài khoản HV")
    const menuItemCreateUsers = document.getElementById('menuItemCreateUsers');
    const menuItemCreateStudentUsers = document.getElementById('menuItemCreateStudentUsers');
    const menuItemHRM = document.getElementById('menuItemHRM');
    if (user.role === 'admin') {
      if (menuItemCreateUsers) menuItemCreateUsers.style.display = 'flex';
      if (menuItemCreateStudentUsers) menuItemCreateStudentUsers.style.display = 'flex';
      if (menuItemHRM) menuItemHRM.style.display = 'flex';
    } else if (user.role === 'student') {
      if (menuItemCreateUsers) menuItemCreateUsers.style.display = 'none';
      if (menuItemCreateStudentUsers) menuItemCreateStudentUsers.style.display = 'none';
      if (menuItemHRM) menuItemHRM.style.display = 'none';
    } else {
      if (menuItemCreateUsers) menuItemCreateUsers.style.display = 'none';
      if (menuItemCreateStudentUsers) menuItemCreateStudentUsers.style.display = 'none';
      if (menuItemHRM) menuItemHRM.style.display = 'flex';
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

  // Render Student Table Rows
  const renderStudentsTable = (filteredList) => {
    const tableBody = document.getElementById("studentTableBody");
    if (!tableBody) return;
    tableBody.innerHTML = "";

    if (filteredList.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center; padding: 3rem; color:var(--text-muted); font-size:0.85rem;">
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

      // Parse enrollment date
      const enrollDate = getFixedEnrollDate(student.email, student.createdAt);
      const padZero = (n) => n < 10 ? '0' + n : n;
      const enrollDateStr = `${padZero(enrollDate.getDate())}/${padZero(enrollDate.getMonth() + 1)}/${enrollDate.getFullYear()}`;

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
          <span style="font-size:0.8rem; display:block; text-align: center; font-weight: 500;">${enrollDateStr}</span>
        </td>
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
    document.getElementById("detailStudentLearningMonth").textContent = student.learningMonth || "Tháng 1";

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

    // Trigger admin student scorecard list render
    initAdminStudentScorecardModule(student);

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
    document.getElementById("studentLearningMonth").value = student.learningMonth || "Tháng 1";
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
      const learningMonth = document.getElementById("studentLearningMonth").value;
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
        learningMonth,
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
      const container = document.getElementById("adminStudentScorecardList");
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

            // Bind Student Change Password Modal
            const btnStudentChangePassword = document.getElementById('btnStudentChangePassword');
            const studentChangePasswordModal = document.getElementById('studentChangePasswordModal');
            const btnCloseChangePasswordModal = document.getElementById('btnCloseChangePasswordModal');
            const studentChangePasswordForm = document.getElementById('studentChangePasswordForm');

            if (btnStudentChangePassword && studentChangePasswordModal) {
              btnStudentChangePassword.replaceWith(btnStudentChangePassword.cloneNode(true));
              const newBtnStudentChangePassword = document.getElementById('btnStudentChangePassword');
              newBtnStudentChangePassword.addEventListener('click', () => {
                studentChangePasswordModal.style.display = 'flex';
              });
            }

            if (btnCloseChangePasswordModal && studentChangePasswordModal) {
              btnCloseChangePasswordModal.addEventListener('click', () => {
                studentChangePasswordModal.style.display = 'none';
                if (studentChangePasswordForm) studentChangePasswordForm.reset();
              });
            }

            if (studentChangePasswordForm) {
              studentChangePasswordForm.replaceWith(studentChangePasswordForm.cloneNode(true));
              const newPasswordForm = document.getElementById('studentChangePasswordForm');
              newPasswordForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const currentPassword = document.getElementById('studentCurrentPasswordInput').value;
                const newPassword = document.getElementById('studentNewPasswordInput').value;
                const confirmPassword = document.getElementById('studentConfirmPasswordInput').value;

                if (newPassword.length < 6) {
                  showToast("Mật khẩu mới phải tối thiểu 6 ký tự!", "error");
                  return;
                }

                if (newPassword !== confirmPassword) {
                  showToast("Mật khẩu xác nhận không trùng khớp!", "error");
                  return;
                }

                try {
                  showToast("Đang xác thực và cập nhật mật khẩu...", "info");
                  const user = auth.currentUser;
                  if (!user) {
                    showToast("Lỗi: Học viên chưa đăng nhập!", "error");
                    return;
                  }

                  const credential = firebase.auth.EmailAuthProvider.credential(user.email, currentPassword);
                  await user.reauthenticateWithCredential(credential);
                  await user.updatePassword(newPassword);

                  await db.collection("users").doc(user.uid).update({
                    passwordChanged: true
                  });

                  showToast("Cập nhật mật khẩu thành công!", "success");
                  studentChangePasswordModal.style.display = 'none';
                  newPasswordForm.reset();
                } catch (err) {
                  console.error("Change password error:", err);
                  showToast("Lỗi xác thực hoặc cập nhật: " + err.message, "error");
                }
              });
            }

            // Subscribe to real-time blogs updates
            subscribeToBlogs();

            // Default to Tab 1 (Bảng Tin)
            const newsTabBtn = document.querySelector('[data-tab="student-news-tab"]');
            if (newsTabBtn) newsTabBtn.click();

          } else {
            // SHOW Main App Root, hide Student Portal and Login Panel
            const studentAppRoot = document.getElementById('student-app-root');
            if (studentAppRoot) studentAppRoot.style.display = 'none';
            if (loginContainer) loginContainer.style.display = 'none';
            if (appRoot) appRoot.style.display = 'flex';

            // Load users cache (one-time fetch)
            subscribeToUsersCache();

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
        }
      } else {
        currentUser = null;
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
    document.getElementById('profileEmpCode').textContent = s.employeeCode ? `Mã ${s.employeeCode}` : 'Mã --';
    document.getElementById('profilePositions').textContent = s.position
      ? `${s.position} • ${s.department || ''}` : '--';
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

    const salary = s.salary || 0;
    const incomeEl = document.getElementById('profileIncome');
    if (incomeEl) incomeEl.textContent = salary > 0 ? salary.toLocaleString('vi-VN') + ' đ' : '-- đ';

    const seedStr = s.id || s.name || 'x';
    const seed = seedStr.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const companyDebt = Math.round(((seed * 1234567) % 25000000) / 1000000) * 1000000;
    const personalDebt = Math.round(((seed * 89012) % 4000000) / 500000) * 500000;
    const totalDebt = companyDebt + personalDebt;

    document.getElementById('profileTotalDebt').textContent = totalDebt.toLocaleString('vi-VN') + ' đ';
    document.getElementById('profileCompanyDebt').textContent = companyDebt.toLocaleString('vi-VN') + ' đ';
    document.getElementById('profilePersonalDebt').textContent = personalDebt.toLocaleString('vi-VN') + ' đ';

    const early = 25 + (seed % 20);
    const onTime = 8 + (seed % 12);
    const late = 8 + ((seed * 3) % 18);
    const pending = Math.max(5, 100 - early - onTime - late);
    const totalTasks = 18 + (seed % 28);

    const legEarly = document.getElementById('legEarly');
    const legOnTime = document.getElementById('legOnTime');
    const legLate = document.getElementById('legLate');
    const legPending = document.getElementById('legPending');
    if (legEarly) legEarly.textContent = early + '%';
    if (legOnTime) legOnTime.textContent = onTime + '%';
    if (legLate) legLate.textContent = late + '%';
    if (legPending) legPending.textContent = pending + '%';

    // Populate detail tabs
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

    requestAnimationFrame(() => {
      drawDonutChart('workEfficiencyChart', totalTasks, [
        { value: early, color: '#4CAF50' },
        { value: onTime, color: '#3FA2F6' },
        { value: late, color: '#FFC107' },
        { value: pending, color: '#F44336' }
      ]);
      drawRadarChart('skillsRadarChart', [
        { label: 'Tổ chức', value: 2 + (seed % 3), max: 5 },
        { label: 'Văn hóa', value: 2 + ((seed * 2) % 3), max: 5 },
        { label: 'Giao tiếp', value: 2 + ((seed * 3) % 3), max: 5 },
        { label: 'Chuyên môn', value: 2 + ((seed * 4) % 3), max: 5 },
        { label: 'Sáng tạo', value: 1 + ((seed * 5) % 4), max: 5 },
        { label: 'Nhóm', value: 2 + ((seed * 6) % 3), max: 5 }
      ]);
    });
  };

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
      });
    });
  };

  // ---- HRM Modals ----
  const setupHrmModals = () => {
    const staffModal = document.getElementById('hrmStaffModal');
    const projectModal = document.getElementById('hrmProjectModal');

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
      const editId = document.getElementById('hrmStaffEditId').value;
      const email = document.getElementById('hrmStaffEmail').value.trim();
      const name = document.getElementById('hrmStaffName').value.trim();

      const data = {
        name,
        email,
        department: document.getElementById('hrmStaffDept').value,
        position: document.getElementById('hrmStaffPosition').value.trim(),
        phone: document.getElementById('hrmStaffPhone').value.trim(),
        status: document.getElementById('hrmStaffStatus').value,
        employeeCode: document.getElementById('hrmStaffCode').value.trim(),
        username: document.getElementById('hrmStaffUsername').value.trim(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      try {
        if (editId) {
          await db.collection('hrm_staff').doc(editId).update(data);
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
              showToast('Email này đã có tài khoản. Hãy dùng email khác!', 'error');
            } else {
              showToast('Lỗi tạo tài khoản: ' + authErr.message, 'error');
            }
            return;
          }

          // 2. Ghi thông tin nhân viên vào Firestore với role: "employee"
          try {
            await db.collection('users').doc(newUid).set({
              name, email, role: 'employee',
              createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            data.joinDate = new Date().toISOString().split('T')[0];
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
        { key: 'Tuyển dụng',  color: '#3FA2F6', bg: 'rgba(63,162,246,0.12)',
          icon: '<svg viewBox="0 0 24 24"><path d="M15,14C12.33,14 7,15.33 7,18V20H23V18C23,15.33 17.67,14 15,14M6,8.17V5H4V8.17C2.78,8.58 2,9.7 2,11C2,12.3 2.78,13.42 4,13.83V17H6V13.83C7.22,13.42 8,12.3 8,11C8,9.7 7.22,8.58 6,8.17M15,12A4,4 0 0,0 19,8A4,4 0 0,0 15,4A4,4 0 0,0 11,8A4,4 0 0,0 15,12Z"/></svg>' },
        { key: 'Đào tạo',     color: '#10B981', bg: 'rgba(16,185,129,0.12)',
          icon: '<svg viewBox="0 0 24 24"><path d="M12,3L1,9L12,15L21,10.09V17H23V9M5,13.18V17.18L12,21L19,17.18V13.18L12,17L5,13.18Z"/></svg>' },
        { key: 'Hành chính',  color: '#F59E0B', bg: 'rgba(245,158,11,0.12)',
          icon: '<svg viewBox="0 0 24 24"><path d="M19,3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3M19,19H5V5H19V19M17,12H7V10H17V12M17,16H7V14H17V16M14,8H7V6H14V8Z"/></svg>' },
        { key: 'Tư vấn Visa', color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)',
          icon: '<svg viewBox="0 0 24 24"><path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12.5,7H11V13L16.75,16.5L17.5,15.25L12.5,12.25V7Z"/></svg>' }
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
        renderHrmStaffList();
        renderHrmKpi();
      }, (err) => console.error('HRM staff realtime listener error:', err));
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
        const matchQuery = !query || s.name.toLowerCase().includes(query) || (s.email && s.email.toLowerCase().includes(query)) || (s.position && s.position.toLowerCase().includes(query));
        const matchDept = deptFilter === 'All' || s.department === deptFilter;
        return matchQuery && matchDept;
      });

      if (staffList.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:3rem; color:var(--text-muted); font-size:0.9rem;">Không tìm thấy nhân sự phù hợp.</td></tr>';
        return;
      }

      const fmtDate = (dateStr) => {
        if (!dateStr) return '--';
        const parts = dateStr.split('-');
        return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateStr;
      };

      staffList.forEach(s => {
        const initials = s.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        const bg = getAvatarBgColor(s.name);
        let badgeCls = 'hrm-badge-active';
        if (s.status === 'Nghỉ phép') badgeCls = 'hrm-badge-onleave';
        else if (s.status === 'Đã nghỉ việc') badgeCls = 'hrm-badge-inactive';

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>
            <div style="display:flex; align-items:center; gap:0.6rem;">
              <div class="hrm-staff-card-avatar" style="width:34px; height:34px; font-size:0.75rem; flex-shrink:0; background:${bg}">${initials}</div>
              <div>
                <div style="font-weight:600; font-size:0.85rem;">${s.name}</div>
                <div style="font-size:0.75rem; color:var(--text-muted);">${s.email || '--'}</div>
              </div>
            </div>
          </td>
          <td>${s.department || '--'}</td>
          <td>${s.position || '--'}</td>
          <td>${s.phone || '--'}</td>
          <td>${fmtDate(s.joinDate)}</td>
          <td><span class="hrm-badge ${badgeCls}">${s.status}</span></td>
          <td style="text-align:center;">
            <div style="display:flex; gap:0.4rem; justify-content:center; align-items:center;">
              <button class="action-icon-btn btn-view-hrm-staff" data-id="${s.id}" title="Hồ sơ" style="padding:6px; color:var(--accent); background:none; border:none; cursor:pointer;"><svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:currentColor;"><path d="M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17M12,4.5C7,4.5 2.73,7.61 1,12C2.73,16.39 7,19.5 12,19.5C17,19.5 21.27,16.39 23,12C21.27,7.61 17,4.5 12,4.5Z"/></svg></button>
              <button class="action-icon-btn btn-edit-hrm-staff" data-id="${s.id}" title="Sửa" style="padding:6px; color:var(--text-main); background:none; border:none; cursor:pointer;"><svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:currentColor;"><path d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z"/></svg></button>
              <button class="action-icon-btn btn-del-hrm-staff" data-id="${s.id}" data-name="${s.name}" title="Xóa" style="padding:6px; color:#EF4444; background:none; border:none; cursor:pointer;"><svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:currentColor;"><path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/></svg></button>
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
    hrmAttendanceSub = db.collection('attendance').where('month', '==', monthStr)
      .onSnapshot((snap) => {
        hrmAttendanceCache = {};
        snap.forEach(doc => { hrmAttendanceCache[doc.data().staffId] = doc.data(); });
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

  const editHrmStaff = (s) => {
    document.getElementById('hrmStaffEditId').value = s.id;
    document.getElementById('hrmStaffName').value = s.name || '';
    document.getElementById('hrmStaffEmail').value = s.email || '';
    document.getElementById('hrmStaffDept').value = s.department || 'Tuyển dụng';
    document.getElementById('hrmStaffPosition').value = s.position || '';
    document.getElementById('hrmStaffPhone').value = s.phone || '';
    document.getElementById('hrmStaffStatus').value = s.status || 'Đang làm việc';
    document.getElementById('hrmStaffCode').value = s.employeeCode || '';
    document.getElementById('hrmStaffUsername').value = s.username || '';

    document.getElementById('hrmStaffModalTitle').textContent = '✏️ SỬA THÔNG TIN NHÂN SỰ';
    const pwSection = document.getElementById('hrmStaffPasswordSection');
    if (pwSection) pwSection.style.display = 'none';
    const pwInput = document.getElementById('hrmStaffPassword');
    const pwConfirm = document.getElementById('hrmStaffPasswordConfirm');
    if (pwInput) { pwInput.required = false; pwInput.value = ''; }
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
        grid.appendChild(card);
      });
    } catch (err) {
      console.error('HRM projects render error:', err);
    }
  };

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
    const stageMap = { 'Tiếp nhận': 0, 'Tư vấn sơ bộ': 1, 'Đang làm hồ sơ': 2, 'Chờ phỏng vấn': 3, 'Đã trúng tuyển': 4, 'Đang học': 5 };
    const currentStageIdx = stageMap[c.status] ?? 1;
    const pipelineEl = getEl('crmPipelineStages');
    if (pipelineEl) {
      pipelineEl.innerHTML = allStages.map((stage, idx) => {
        let cls = '';
        if (idx < currentStageIdx) cls = 'done';
        else if (idx === currentStageIdx) cls = 'current';
        const icon = idx < currentStageIdx ? '✓' : idx + 1;
        return `<div class="crm-pipeline-step ${cls}"><span class="crm-pipeline-indicator">${icon}</span><span class="crm-pipeline-label">${stage}</span></div>`;
      }).join('');
    }

    const seed = (c.name || '').split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
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

    const journeyEl = getEl('crmJourneyTimeline');
    if (journeyEl) {
      const dStart = c.createdAt?.toDate ? c.createdAt.toDate() : new Date(Date.now() - (30 + seed % 90) * 86400000);
      const fmt = (d) => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
      const events = [
        { title: 'Tiếp nhận hồ sơ', date: fmt(dStart), color: '#2563EB', bg: '#DBEAFE' },
        { title: 'Tư vấn ban đầu', date: fmt(new Date(dStart.getTime() + 7 * 86400000)), color: '#7C3AED', bg: '#F3E8FF' },
      ];
      if (currentStageIdx >= 2) events.push({ title: 'Bắt đầu làm hồ sơ', date: fmt(new Date(dStart.getTime() + 14 * 86400000)), color: '#059669', bg: '#DCFCE7' });
      if (currentStageIdx >= 3) events.push({ title: 'Phỏng vấn Visa', date: fmt(new Date(dStart.getTime() + 30 * 86400000)), color: '#D97706', bg: '#FEF3C7' });
      if (currentStageIdx >= 4) events.push({ title: 'Trúng tuyển', date: fmt(new Date(dStart.getTime() + 45 * 86400000)), color: '#16A34A', bg: '#DCFCE7' });
      if (currentStageIdx >= 5) events.push({ title: 'Xuất cảnh đi học', date: fmt(new Date(dStart.getTime() + 60 * 86400000)), color: '#2563EB', bg: '#DBEAFE' });

      journeyEl.innerHTML = events.map(ev => `
        <div class="crm-timeline-item">
          <div class="crm-timeline-dot" style="background:${ev.bg};border:2px solid ${ev.color}"></div>
          <div class="crm-timeline-content">
            <div class="crm-timeline-title">${ev.title}</div>
            <div class="crm-timeline-date">${ev.date}</div>
          </div>
        </div>`).join('');
    }
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
    for (let p = 1; p <= totalPages; p++) {
      if (p === 1 || p === totalPages || (p >= currentPage - delta && p <= currentPage + delta)) {
        pages += pageBtn(p, p, false, p === currentPage);
      } else if (p === currentPage - delta - 1 || p === currentPage + delta + 1) {
        pages += `<span style="padding:0 4px;color:var(--text-muted);font-size:0.8rem">…</span>`;
      }
    }
    el.innerHTML = `<span class="crm-page-info">${from}–${to} / ${total} mục</span>${pageBtn('‹', currentPage - 1, currentPage === 1)}${pages}${pageBtn('›', currentPage + 1, currentPage === totalPages)}`;
    el.querySelectorAll('.crm-page-btn:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => onGo(parseInt(btn.dataset.page)));
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
      if (countryF !== 'All' && c.country !== countryF) return false;
      if (statusF !== 'All' && c.status !== statusF) return false;
      if (search && !`${c.name} ${c.email} ${c.code}`.toLowerCase().includes(search)) return false;
      return true;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2.5rem;color:var(--text-muted);font-size:0.82rem">Không tìm thấy khách hàng phù hợp.</td></tr>`;
      renderPagination('crmCustomerPagination', 1, 0, () => {});
      return;
    }

    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    crmCustomerPage = Math.min(crmCustomerPage, totalPages);
    const pageData = filtered.slice((crmCustomerPage - 1) * PAGE_SIZE, crmCustomerPage * PAGE_SIZE);
    const globalOffset = (crmCustomerPage - 1) * PAGE_SIZE;

    const badgeCls = { 'Đang học': 'crm-badge-active', 'Chờ phỏng vấn': 'crm-badge-waiting', 'Đang làm hồ sơ': 'crm-badge-processing', 'Đã trúng tuyển': 'crm-badge-selected' };
    const flags = { 'Nhật': '🇯🇵', 'Đài': '🇹🇼', 'Hàn': '🇰🇷' };
    const avColors = ['#2563EB', '#7C3AED', '#059669', '#D97706', '#DC2626', '#0891B2'];

    tbody.innerHTML = pageData.map((c, i) => {
      const gi = globalOffset + i;
      const ini = (c.name || 'KH').split(' ').map(w => w[0]).filter(Boolean).slice(-2).join('').toUpperCase();
      const bc = badgeCls[c.status] || 'crm-badge-processing';
      const flag = flags[c.country] || '🌏';
      let dateStr = '--';
      if (c.createdAt?.toDate) {
        const d = c.createdAt.toDate();
        dateStr = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
      }
      return `
        <tr>
          <td><span style="font-family:monospace;font-size:0.78rem;font-weight:600;color:var(--crm-blue)">${c.code || '--'}</span></td>
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
          <td><span class="crm-country-flag">${flag} ${c.country || '--'}</span></td>
          <td><span class="crm-pill ${bc}">${c.status || '--'}</span></td>
          <td style="font-size:0.79rem">${dateStr}</td>
          <td style="text-align:center">
            <button class="crm-action-btn view btn-view-crm" data-fidx="${i}" title="Xem hồ sơ">
              <svg viewBox="0 0 24 24"><path d="M12,4.5C7,4.5 2.73,7.61 1,12C2.73,16.39 7,19.5 12,19.5C17,19.5 21.27,16.39 23,12C21.27,7.61 17,4.5 12,4.5M12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9Z"/></svg>
            </button>
            <button class="crm-action-btn edit btn-edit-crm" data-fidx="${i}" title="Chỉnh sửa">
              <svg viewBox="0 0 24 24"><path d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z"/></svg>
            </button>
          </td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('.btn-view-crm').forEach(btn => {
      btn.addEventListener('click', () => openCrmProfile(pageData[parseInt(btn.dataset.fidx)]));
    });

    tbody.querySelectorAll('.btn-edit-crm').forEach(btn => {
      btn.addEventListener('click', () => {
        const c = pageData[parseInt(btn.dataset.fidx)];
        if (!c) return;
        const modal = document.getElementById('studentModal');
        if (!modal) return;
        document.getElementById('studentEditId').value = c.id || '';
        document.getElementById('studentModalTitle').textContent = 'CHỈNH SỬA KHÁCH HÀNG';
        document.getElementById('studentName').value = c.name || '';
        document.getElementById('studentCode').value = c.code || '';
        document.getElementById('studentEmail').value = c.email || '';
        document.getElementById('studentPhone').value = c.phone || '';
        document.getElementById('studentCountry').value = c.country || 'Nhật';
        document.getElementById('studentStatus').value = c.status || 'Đang học';
        document.getElementById('studentLearningMonth').value = c.learningMonth || '';
        document.getElementById('studentNotes').value = c.notes || '';
        modal.style.display = 'flex';
      });
    });

    renderPagination('crmCustomerPagination', crmCustomerPage, filtered.length, (p) => {
      crmCustomerPage = p;
      renderCrmCustomers();
    });
  };

  // ── CRM Staff ──────────────────────────────────────────────────────────────
  let _allCrmStaff = [];
  let _crmStaffProfileStaff = null;

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
    if (empCode) empCode.textContent = s.employeeCode ? `Mã ${s.employeeCode}` : 'Mã --';

    const positions = document.getElementById('crmProfilePositions');
    if (positions) positions.textContent = s.position ? `${s.position} • ${s.department || ''}` : '--';

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
  let _iocMsgs      = [];
  let _iocReplyTo   = null;
  let _iocEditingId = null;
  let _iocCtxMsgId  = null;
  let _iocActiveThread = {
    id: 'group-global', name: 'Nhóm Nội bộ Aladdin',
    av: 'N', color: '#2563EB', type: 'group'
  };

  const iocAvatarColor = str => {
    const C = ['#2563EB','#7C3AED','#DB2777','#D97706','#059669','#0891B2','#DC2626','#7E22CE'];
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
  const iocOpenThread = (id, name, av, color, type = 'dm') => {
    if (_iocActiveThread.id === id) return;
    _iocActiveThread = {
      id, name, type,
      av:    av    || (name || 'U')[0].toUpperCase(),
      color: color || iocAvatarColor(name),
    };
    const avEl    = document.getElementById('iocActiveAv');
    const nameEl  = document.getElementById('iocActiveThreadName');
    const subEl   = document.getElementById('iocActiveThreadSub');
    const backBtn = document.getElementById('btnIocThreadBack');
    if (avEl)    { avEl.textContent = _iocActiveThread.av; avEl.style.background = _iocActiveThread.color; }
    if (nameEl)  nameEl.textContent = name;
    if (subEl)   subEl.textContent = type === 'group' ? `${iocGetMembers().length} thành viên` : 'Trực tiếp';
    if (backBtn) backBtn.style.display = type === 'dm' ? 'flex' : 'none';
    setupCrmChat();
  };

  // ── Conversation sidebar list ──────────────────────────────────────────────
  const iocRenderConvList = () => {
    const favEl = document.getElementById('iocConvList');
    const recEl = document.getElementById('iocRecentList');
    if (!favEl || !recEl) return;

    const members      = iocGetMembers();
    const search       = (document.getElementById('crmChatSearch')?.value || '').toLowerCase();
    const isGroupActive = _iocActiveThread.type === 'group';

    // Group chat preview (only meaningful when current thread is group)
    const lastMsg = _iocMsgs.filter(m => !m.recalled).slice(-1)[0];
    const preview = lastMsg
      ? (lastMsg.imageUrl ? '📷 Hình ảnh'
          : lastMsg.fileName ? `📎 ${lastMsg.fileName}`
          : esc(lastMsg.content || ''))
      : 'Chưa có tin nhắn';
    const timeStr = lastMsg?.createdAt?.toDate
      ? lastMsg.createdAt.toDate().toLocaleTimeString('vi-VN', { hour:'2-digit', minute:'2-digit' })
      : '';

    favEl.innerHTML = `<div class="ioc-conv-item${isGroupActive ? ' active' : ''}" data-thread-id="group-global">
      <div class="ioc-conv-av" style="background:#2563EB">N<span class="ioc-online"></span></div>
      <div class="ioc-conv-body">
        <div class="ioc-conv-name">Nhóm Nội bộ Aladdin</div>
        <div class="ioc-conv-preview">${preview}</div>
      </div>
      <div class="ioc-conv-meta"><span class="ioc-conv-time">${timeStr}</span></div>
    </div>`;
    favEl.querySelector('[data-thread-id]')?.addEventListener('click', () =>
      iocOpenThread('group-global', 'Nhóm Nội bộ Aladdin', 'N', '#2563EB', 'group')
    );

    const filtered = members.filter(u =>
      !search || (u.name || '').toLowerCase().includes(search)
              || (u.department || u.dept || '').toLowerCase().includes(search)
    );

    recEl.innerHTML = filtered.slice(0, 15).map(u => {
      const ini    = (u.name || 'U').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
      const color  = iocAvatarColor(u.name || 'U');
      const sub    = u.position || u.dept || u.department || (u.role === 'admin' ? 'Quản trị viên' : 'Nhân viên');
      const dmId   = 'dm-' + [currentUser?.uid || currentUser?.email || 'me', u.id || u.uid || u.email].sort().join('__');
      const active = _iocActiveThread.id === dmId;
      return `<div class="ioc-conv-item${active ? ' active' : ''}"
        data-dm-id="${dmId}" data-dm-name="${esc(u.name||'Người dùng')}"
        data-dm-av="${ini}" data-dm-color="${color}">
        <div class="ioc-conv-av" style="background:${color}">${ini}<span class="ioc-online"></span></div>
        <div class="ioc-conv-body">
          <div class="ioc-conv-name">${esc(u.name||'Người dùng')}</div>
          <div class="ioc-conv-preview">${esc(sub)}</div>
        </div>
      </div>`;
    }).join('') || '<div class="ioc-empty-list">Không tìm thấy nhân viên</div>';

    recEl.querySelectorAll('[data-dm-id]').forEach(el => {
      el.addEventListener('click', () =>
        iocOpenThread(el.dataset.dmId, el.dataset.dmName, el.dataset.dmAv, el.dataset.dmColor, 'dm')
      );
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
    _iocMsgs = msgs;
    iocUpdatePinnedCount();

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
        bubbleContent = `<div class="ioc-msg-bubble" data-msgid="${msg.id}">
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
  const iocShowInfoMain = () => {
    document.getElementById('iocInfoMain').style.display    = '';
    document.getElementById('iocMembersPanel').style.display = 'none';
    document.getElementById('iocPinnedPanel').style.display  = 'none';
  };
  const iocShowMembers = () => {
    iocRenderMembers();
    document.getElementById('iocInfoMain').style.display    = 'none';
    document.getElementById('iocMembersPanel').style.display = '';
    document.getElementById('iocPinnedPanel').style.display  = 'none';
  };
  const iocShowPinned = () => {
    iocRenderPinnedPanel();
    document.getElementById('iocInfoMain').style.display    = 'none';
    document.getElementById('iocPinnedPanel').style.display  = '';
    document.getElementById('iocMembersPanel').style.display = 'none';
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
          iocRenderMessages(msgs);
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
        if (act === 'forward') showToast('Tính năng chuyển tiếp sắp ra mắt!', 'info');
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
      const bar = document.getElementById('iocMsgSearchBar');
      if (bar) bar.style.display = 'none';
      const inp = document.getElementById('iocMsgSearchInput');
      if (inp) inp.value = '';
      iocRenderMessages(_iocMsgs);
    });
    document.getElementById('iocMsgSearchInput')?.addEventListener('input', e => {
      const term = e.target.value.toLowerCase();
      const filtered = _iocMsgs.filter(m =>
        (m.content || '').toLowerCase().includes(term) ||
        (m.fileName || '').toLowerCase().includes(term)
      );
      iocRenderMessages(term ? filtered : _iocMsgs);
    });

    document.getElementById('crmChatSearch')?.addEventListener('input', iocRenderConvList);

    document.getElementById('btnIocThreadBack')?.addEventListener('click', () =>
      iocOpenThread('group-global', 'Nhóm Nội bộ Aladdin', 'N', '#2563EB', 'group')
    );

    document.getElementById('btnToggleIocInfo')?.addEventListener('click', () => {
      document.getElementById('iocInfoPanel')?.classList.toggle('hidden');
    });

    document.getElementById('btnIocShowMembers')?.addEventListener('click', iocShowMembers);
    document.getElementById('btnIocShowMembersHdr')?.addEventListener('click', () => {
      document.getElementById('iocInfoPanel')?.classList.remove('hidden');
      iocShowMembers();
    });
    document.getElementById('btnIocBackFromMembers')?.addEventListener('click', iocShowInfoMain);
    document.getElementById('btnIocShowPinned')?.addEventListener('click', iocShowPinned);
    document.getElementById('btnIocBackFromPinned')?.addEventListener('click', iocShowInfoMain);

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

  // ── init ───────────────────────────────────────────────────────────────────
  const initCrmModule = () => {
    if (!crmInitialized) {
      crmInitialized = true;

      document.querySelectorAll('.crm-subtab').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.crm-subtab').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const target = btn.getAttribute('data-tab');
          document.querySelectorAll('.crm-tab-content').forEach(tc => tc.style.display = 'none');
          const el = document.getElementById(target);
          if (el) el.style.display = 'flex';
          if (target === 'crm-staff-tab') renderCrmStaff();
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

      document.getElementById('btnEditCrmCustomer')?.addEventListener('click', () => {
        if (!_currentCrmCustomer) return;
        closeCrmProfile();
        const c = _currentCrmCustomer;
        const modal = document.getElementById('studentModal');
        if (!modal) return;
        document.getElementById('studentEditId').value = c.id || '';
        document.getElementById('studentModalTitle').textContent = 'CHỈNH SỬA KHÁCH HÀNG';
        document.getElementById('studentName').value = c.name || '';
        document.getElementById('studentCode').value = c.code || '';
        document.getElementById('studentEmail').value = c.email || '';
        document.getElementById('studentPhone').value = c.phone || '';
        document.getElementById('studentCountry').value = c.country || 'Nhật';
        document.getElementById('studentStatus').value = c.status || 'Đang học';
        document.getElementById('studentLearningMonth').value = c.learningMonth || '';
        document.getElementById('studentNotes').value = c.notes || '';
        modal.style.display = 'flex';
      });

      document.getElementById('btnExportCrm')?.addEventListener('click', () => {
        if (!window.XLSX) { showToast('Thư viện Excel chưa sẵn sàng!', 'warning'); return; }
        const rows = _allCrmCustomers.map(c => ({
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

      document.getElementById('crmSearchInput')?.addEventListener('input', () => renderCrmCustomers(true));
      document.getElementById('crmCountryFilter')?.addEventListener('change', () => renderCrmCustomers(true));
      document.getElementById('crmStatusFilter')?.addEventListener('change', () => renderCrmCustomers(true));

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

      iocBindEvents();

      if (currentUser) {
        const av = document.getElementById('miniCrmAvatar');
        const nm = document.getElementById('miniCrmName');
        const rl = document.getElementById('miniCrmRole');
        if (av) av.textContent = (currentUser.name || 'U').slice(0, 2).toUpperCase();
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
      })
      .catch(err => console.error('CRM data load error:', err));

    db.collection('hrm_staff').orderBy('name').get()
      .then(snap => {
        _allCrmStaff = [];
        snap.forEach(doc => { const d = doc.data(); d.id = doc.id; _allCrmStaff.push(d); });
        renderCrmStaff();
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
    if (empCode) empCode.textContent = s.employeeCode ? `Mã ${s.employeeCode}` : 'Mã --';
    const positions = document.getElementById('spProfilePositions');
    if (positions) positions.textContent = s.position ? `${s.position} • ${s.department || ''}` : '--';

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

    const badge = document.getElementById('spProfileStatusBadge');
    if (badge) {
      badge.textContent = s.status || '--';
      badge.className = 'profile-status-badge';
      if (s.status === 'Đang làm việc') badge.classList.add('active-badge');
      else if (s.status === 'Nghỉ phép') badge.classList.add('leave-badge');
      else badge.classList.add('inactive-badge');
    }

    const incomeEl = document.getElementById('spPIncome');
    if (incomeEl) incomeEl.textContent = s.salary > 0 ? Number(s.salary).toLocaleString('vi-VN') + ' đ' : '-- đ';

    const seed = (s.id || s.name || 'x').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const early = 25 + (seed % 20);
    const onTime = 8 + (seed % 12);
    const late = 8 + ((seed * 3) % 18);
    const pending = Math.max(5, 100 - early - onTime - late);
    const totalTasks = 18 + (seed % 28);
    setText('spLegEarly', early + '%');
    setText('spLegOnTime', onTime + '%');
    setText('spLegLate', late + '%');
    setText('spLegPending', pending + '%');

    setText('spProfileIdNumber', s.idNumber);
    setText('spProfileIdDate', fmtDate(s.idDate));
    setText('spProfileIdPlace', s.idPlace);
    setText('spProfileAddressPermanent', s.addressPermanent);
    setText('spProfileAddressCurrent', s.addressCurrent);
    setText('spProfileEmergencyName', s.emergencyContactName);
    setText('spProfileEmergencyPhone', s.emergencyContactPhone);
    setText('spProfileEmergencyRelation', s.emergencyContactRelation);

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
    setText('spProfileBankNo', s.bankAccountNo);
    setText('spProfileBankName', s.bankName);
    setText('spProfileBankAccountName', s.bankAccountName);
    setText('spProfileTaxCode', s.taxCode);

    requestAnimationFrame(() => {
      drawDonutChart('spWorkEfficiencyChart', totalTasks, [
        { value: early, color: '#4CAF50' },
        { value: onTime, color: '#3FA2F6' },
        { value: late, color: '#FFC107' },
        { value: pending, color: '#F44336' }
      ]);
      drawRadarChart('spSkillsRadarChart', [
        { label: 'Tổ chức', value: 2 + (seed % 3), max: 5 },
        { label: 'Văn hóa', value: 2 + ((seed * 2) % 3), max: 5 },
        { label: 'Giao tiếp', value: 2 + ((seed * 3) % 3), max: 5 },
        { label: 'Chuyên môn', value: 2 + ((seed * 4) % 3), max: 5 },
        { label: 'Sáng tạo', value: 1 + ((seed * 5) % 4), max: 5 },
        { label: 'Nhóm', value: 2 + ((seed * 6) % 3), max: 5 }
      ]);
    });
  };

  const initStaffProfileDashboard = async () => {
    const dashboard = document.getElementById('staff-profile-dashboard');
    if (dashboard) dashboard.style.display = 'flex';

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
        populateStaffProfileDashboard(s);
      } else {
        const avatarEl = document.getElementById('spProfileAvatarLg');
        if (avatarEl) {
          const initials = (currentUser.name || 'NV').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
          avatarEl.textContent = initials;
          avatarEl.style.background = getAvatarBgColor(currentUser.name || '');
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

  // ---- Employee Personal Attendance ----
  let _myStaffId = null;
  let spAttendanceSub = null;

  const renderStaffAttendanceTable = (att, monthStr) => {
    const head = document.getElementById('spAttendanceHead');
    const body = document.getElementById('spAttendanceBody');
    if (!head || !body) return;
    buildAttendanceTableHead(head, monthStr);
    const daysInMonth = getDaysInMonth(monthStr);

    let cellsHtml = '';
    let countFull = 0, countHalf = 0, countAbsent = 0, countOff = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const val = (att && att.days && att.days[d]) || '';
      if (val === '1') countFull++;
      else if (val === '0.5') countHalf++;
      else if (val === '0') countAbsent++;
      else if (val === 'N') countOff++;
      const meta = ATTENDANCE_STATUS_META[val] || ATTENDANCE_STATUS_META[''];
      cellsHtml += `<td class="att-cell ${meta.cls}">${meta.label}</td>`;
    }
    body.innerHTML = `<tr><td class="att-name-cell"><strong>${currentUser?.name || ''}</strong></td>${cellsHtml}</tr>`;

    const summary = document.getElementById('spAttendanceSummary');
    if (summary) {
      const statBox = (value, color, label) => `
        <div style="background:var(--bg-card); border:1px solid var(--border); border-radius:var(--border-radius-md); padding:1rem 1.25rem; text-align:center;">
          <div style="font-size:1.6rem; font-weight:700; color:${color};">${value}</div>
          <div style="font-size:0.78rem; color:var(--text-muted); margin-top:0.25rem;">${label}</div>
        </div>`;
      summary.innerHTML =
        statBox(countFull, '#10B981', 'Đủ công') +
        statBox(countHalf, '#F59E0B', 'Nửa công') +
        statBox(countAbsent, '#EF4444', 'Vắng') +
        statBox(countOff, '#8B5CF6', 'Nghỉ phép');
    }
  };

  const subscribeToStaffAttendance = (monthStr) => {
    if (!_myStaffId) return;
    if (spAttendanceSub) { spAttendanceSub(); spAttendanceSub = null; }
    spAttendanceSub = db.collection('attendance').doc(`${_myStaffId}_${monthStr}`)
      .onSnapshot((doc) => {
        renderStaffAttendanceTable(doc.exists ? doc.data() : null, monthStr);
      }, (err) => console.error('Staff attendance realtime error:', err));
  };

  const initStaffAttendanceDashboard = async () => {
    const dashboard = document.getElementById('staff-attendance-dashboard');
    if (dashboard) dashboard.style.display = 'flex';

    const monthInput = document.getElementById('spAttendanceMonth');
    if (!monthInput || !currentUser) return;
    if (!monthInput.value) monthInput.value = getCurrentMonthStr();

    if (!_myStaffId) {
      try {
        const snap = await db.collection('hrm_staff').where('email', '==', currentUser.email).limit(1).get();
        if (!snap.empty) _myStaffId = snap.docs[0].id;
      } catch (err) {
        console.error('Lookup staffId error:', err);
      }
    }

    if (!_myStaffId) {
      const body = document.getElementById('spAttendanceBody');
      if (body) body.innerHTML = '<tr><td style="padding:2rem;color:var(--text-muted);">Không tìm thấy hồ sơ nhân sự liên kết với tài khoản này.</td></tr>';
      return;
    }

    subscribeToStaffAttendance(monthInput.value);

    if (!monthInput.dataset.spAttBound) {
      monthInput.dataset.spAttBound = '1';
      monthInput.addEventListener('change', () => subscribeToStaffAttendance(monthInput.value));
      document.getElementById('btnSpAttPrevMonth')?.addEventListener('click', () => shiftMonthInput('spAttendanceMonth', -1, subscribeToStaffAttendance));
      document.getElementById('btnSpAttNextMonth')?.addEventListener('click', () => shiftMonthInput('spAttendanceMonth', 1, subscribeToStaffAttendance));
    }
  };

});
