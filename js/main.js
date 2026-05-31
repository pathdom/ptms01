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
      
      // Auto-append @ptms.hv domain for non-admin accounts if not explicitly typed by the user
      if (emailVal !== 'admin@domain.com' && !emailVal.endsWith('@ptms.hv')) {
        const parts = emailVal.split('@');
        emailVal = parts[0] + '@ptms.hv';
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
    if (targetViewId === 'chat-dashboard') {
      renderThreadList();
      renderMessages(activeThreadId);
    } else if (targetViewId === 'users-dashboard') {
      renderStaffUsersList();
    } else if (targetViewId === 'student-users-dashboard') {
      renderStudentUsersList();
    } else if (targetViewId === 'students-dashboard') {
      applyStudentFiltersAndRender();
    } else if (targetViewId === 'blogs-dashboard') {
      renderAdminBlogsList();
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
      allLoadedMessages = [];
      chatThreads = [];
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
        role: "staff",
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
      if (newEmail && !newEmail.endsWith('@ptms.hv')) {
        const parts = newEmail.split('@');
        newEmail = parts[0] + '@ptms.hv';
      }
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
      if (newEmail && !newEmail.endsWith('@ptms.hv')) {
        const parts = newEmail.split('@');
        newEmail = parts[0] + '@ptms.hv';
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
      if (email && !email.endsWith('@ptms.hv')) {
        const parts = email.split('@');
        email = parts[0] + '@ptms.hv';
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
      if (email && !email.endsWith('@ptms.hv')) {
        const parts = email.split('@');
        email = parts[0] + '@ptms.hv';
      }
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
          .where("role", "==", "staff")
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
    if (usersSubscription) usersSubscription();
    usersSubscription = db.collection("users")
      .onSnapshot((snapshot) => {
        allUsersList = [];
        snapshot.forEach((doc) => {
          const u = doc.data();
          u.uid = doc.id;
          usersCache[u.uid] = u;
          allUsersList.push(u);
        });
        rebuildChatThreads();
      }, (error) => {
        console.error("Users cache observer failure:", error);
      });
  };

  const subscribeToContacts = () => {
    if (contactsSubscription) contactsSubscription();
    myContacts = [];
    contactsSubscription = db.collection("contacts")
      .where("userUid", "==", auth.currentUser.uid)
      .onSnapshot((snapshot) => {
        myContacts = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          myContacts.push(data.contactUid);
        });
        rebuildChatThreads();
        
        // Re-render search results inside modal if it's currently open
        const modal = document.getElementById('findFriendsModal');
        if (modal && modal.style.display === 'flex') {
          const searchInput = document.getElementById('friendSearchInput');
          renderFriendsSearchResults(searchInput ? searchInput.value : "");
        }
      }, (error) => {
        console.error("Contacts observer failure:", error);
      });
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
  ].map(s => {
    if (s.email) {
      const parts = s.email.split('@');
      s.email = parts[0] + "@ptms.hv";
    }
    return s;
  });

  // Setup Student Database real-time observer
  let currentPage = 1;
  const itemsPerPage = 8;

  const subscribeToStudents = async () => {
    if (studentsSubscription) studentsSubscription();

    // 1. One-time check and pre-populate missing default students to avoid onSnapshot race conditions
    try {
      const snapshot = await db.collection("students").get();
      
      // Perform migration to update all existing student emails in Firestore to end in @ptms.hv
      for (const doc of snapshot.docs) {
        const studentData = doc.data();
        if (studentData.email && !studentData.email.toLowerCase().endsWith("@ptms.hv")) {
          const parts = studentData.email.split('@');
          const newEmail = parts[0].toLowerCase().trim() + "@ptms.hv";
          console.log(`Migrating student email from ${studentData.email} to ${newEmail}`);
          
          // Update in students collection
          await db.collection("students").doc(doc.id).update({
            email: newEmail
          });

          // Also check and update the corresponding user account in users collection if it exists
          const userQuery = await db.collection("users").where("email", "==", studentData.email).get();
          for (const userDoc of userQuery.docs) {
            await db.collection("users").doc(userDoc.id).update({
              email: newEmail
            });
            console.log(`Migrating user account email from ${studentData.email} to ${newEmail}`);
          }
        }
      }

      // Also migrate existing staff user emails in users collection to end in @ptms.hv
      const staffQuery = await db.collection("users").where("role", "==", "staff").get();
      for (const doc of staffQuery.docs) {
        const userData = doc.data();
        if (userData.email && !userData.email.toLowerCase().endsWith("@ptms.hv")) {
          const parts = userData.email.split('@');
          const newEmail = parts[0].toLowerCase().trim() + "@ptms.hv";
          await db.collection("users").doc(doc.id).update({
            email: newEmail
          });
          console.log(`Migrating staff email from ${userData.email} to ${newEmail}`);
        }
      }

      // Re-fetch to ensure the existingEmails set is 100% accurate
      const updatedSnapshot = await db.collection("students").get();
      const existingEmails = new Set();
      updatedSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.email) {
          existingEmails.add(data.email.toLowerCase().trim());
        }
      });

      // Find missing default students
      const missingStudents = defaultStudents.filter(s => s.email && !existingEmails.has(s.email.toLowerCase().trim()));

      if (missingStudents.length > 0) {
        console.log(`Pre-populating ${missingStudents.length} missing default students...`);
        for (const s of missingStudents) {
          const studentCopy = { ...s };
          studentCopy.createdAt = firebase.firestore.FieldValue.serverTimestamp();
          studentCopy.learningMonth = "Tháng 1";
          await db.collection("students").add(studentCopy);
        }
      }
    } catch (err) {
      console.error("Error pre-populating missing default students & migration:", err);
    }

    // 2. Start the real-time observer
    studentsSubscription = db.collection("students")
      .orderBy("code", "asc")
      .onSnapshot((snapshot) => {
        // Real-time migration: delete old mock students containing other countries
        snapshot.forEach((doc) => {
          const data = doc.data();
          if (data.country && !["Nhật", "Đài", "Hàn"].includes(data.country)) {
            db.collection("students").doc(doc.id).delete().catch(console.error);
          }
        });

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
      let enrollDate = new Date();
      if (student.createdAt) {
        if (typeof student.createdAt.toDate === 'function') {
          enrollDate = student.createdAt.toDate();
        } else {
          enrollDate = new Date(student.createdAt);
        }
      }
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
          <span style="font-size:0.72rem; color:var(--text-muted); display:block; text-align: center;">Khóa 6 tháng</span>
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

  // ==========================================
  // DYNAMIC ACADEMIC SCORECARD ENGINE
  // ==========================================

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
    let enrollDate = new Date();
    if (profileData.createdAt) {
      if (typeof profileData.createdAt.toDate === 'function') {
        enrollDate = profileData.createdAt.toDate();
      } else {
        enrollDate = new Date(profileData.createdAt);
      }
    }

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
    let enrollDate = new Date();
    if (student.createdAt) {
      if (typeof student.createdAt.toDate === 'function') {
        enrollDate = student.createdAt.toDate();
      } else {
        enrollDate = new Date(student.createdAt);
      }
    }

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
              let enrollDate = new Date();
              if (profileData.createdAt) {
                if (typeof profileData.createdAt.toDate === 'function') {
                  enrollDate = profileData.createdAt.toDate();
                } else {
                  enrollDate = new Date(profileData.createdAt);
                }
              }

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

            // Subscribe to users and contacts cache updates
            subscribeToUsersCache();
            subscribeToContacts();
            subscribeToFriendRequests();

            // Subscribe to real-time chat updates
            subscribeToChatMessages();

            // Subscribe to real-time students updates
            subscribeToStudents();

            // Subscribe to real-time blogs updates
            subscribeToBlogs();

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
        if (appRoot) appRoot.style.display = 'none';
      }
    });
  };
  checkPortalSession();

});
