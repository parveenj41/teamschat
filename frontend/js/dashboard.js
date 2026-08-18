const session = requireAuthOrRedirect();
if (session) initDashboard(session);

const AVATAR_PALETTE = ['#6264A7', '#C4314B', '#0078D4', '#107C10', '#B4009E', '#CA5010', '#8764B8', '#00B7C3'];

function initDashboard(session) {
  const { token, user } = session;
  const myId = user.id || user._id;

  // ---- DOM refs ----
  const railAvatar = document.getElementById('railAvatar');
  const sidebarTitle = document.getElementById('sidebarTitle');
  const groupList = document.getElementById('groupList');
  const newItemBtn = document.getElementById('newItemBtn');
  const tabGroups = document.getElementById('tabGroups');
  const tabFriends = document.getElementById('tabFriends');
  const tabRequests = document.getElementById('tabRequests');
  const reqBadge = document.getElementById('reqBadge');
  const groupsBadge = document.getElementById('groupsBadge');
  const friendsBadge = document.getElementById('friendsBadge');
  const sidebarSearchWrap = document.getElementById('sidebarSearchWrap');
  const sidebarSearch = document.getElementById('sidebarSearch');

  const newGroupModal = document.getElementById('newGroupModal');
  const cancelNewGroup = document.getElementById('cancelNewGroup');
  const createGroupBtn = document.getElementById('createGroupBtn');
  const newGroupAlert = document.getElementById('newGroupAlert');

  const addFriendModal = document.getElementById('addFriendModal');
  const cancelAddFriend = document.getElementById('cancelAddFriend');
  const confirmAddFriend = document.getElementById('confirmAddFriend');
  const addFriendAlert = document.getElementById('addFriendAlert');

  const noChatSelected = document.getElementById('noChatSelected');
  const activeChatEl = document.getElementById('activeChat');
  const chatAvatar = document.getElementById('chatAvatar');
  const chatHeaderDot = document.getElementById('chatHeaderDot');
  const chatGroupName = document.getElementById('chatGroupName');
  const chatGroupMembers = document.getElementById('chatGroupMembers');
  const chatMessages = document.getElementById('chatMessages');
  const typingIndicator = document.getElementById('typingIndicator');
  const messageInput = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendBtn');
  const manageGroupBtn = document.getElementById('manageGroupBtn');
  const leaveGroupBtn = document.getElementById('leaveGroupBtn');
  const renameFriendBtn = document.getElementById('renameFriendBtn');
  const clearChatBtn = document.getElementById('clearChatBtn');
  const emojiToggle = document.getElementById('emojiToggle');
  const emojiPicker = document.getElementById('emojiPicker');

  const addMemberModal = document.getElementById('addMemberModal');
  const cancelAddMember = document.getElementById('cancelAddMember');
  const confirmAddMember = document.getElementById('confirmAddMember');
  const addMemberAlert = document.getElementById('addMemberAlert');

  const manageGroupModal = document.getElementById('manageGroupModal');
  const manageMemberList = document.getElementById('manageMemberList');
  const manageGroupAlert = document.getElementById('manageGroupAlert');
  const closeManageGroup = document.getElementById('closeManageGroup');
  const openAddMemberFromManage = document.getElementById('openAddMemberFromManage');

  const replyPreview = document.getElementById('replyPreview');
  const replyPreviewName = document.getElementById('replyPreviewName');
  const replyPreviewText = document.getElementById('replyPreviewText');
  const cancelReplyBtn = document.getElementById('cancelReplyBtn');

  // ---- State ----
  let groups = [];
  let friends = [];
  let incomingRequests = [];
  let outgoingRequests = [];
  let unreadCounts = new Map(); // key: group:<id> or private:<friendId>
  let unreadRequestCount = 0;
  let onlineUserIds = new Set();
  let activeTab = 'groups'; // 'groups' | 'friends' | 'requests'
  let activeChat = null; // { type:'group', id, group } | { type:'dm', id (conversationId), friend }
  let pendingReply = null; // { messageId, senderName, text }
  let typingTimeout = null;

  // ---- Helpers ----
  function initials(name) {
    return (name || '?').split(' ').map((p) => p[0]).join('').toUpperCase().slice(0, 2);
  }
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : str;
    return div.innerHTML;
  }
  function colorFor(id, name) {
    const str = String(id || name || '');
    let sum = 0;
    for (let i = 0; i < str.length; i++) sum += str.charCodeAt(i);
    return AVATAR_PALETTE[sum % AVATAR_PALETTE.length];
  }
  function isOnline(userId) {
    return onlineUserIds.has(String(userId));
  }
  function formatLastSeen(dateVal) {
    if (!dateVal) return 'Offline';
    const d = new Date(dateVal);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return sameDay ? `Last seen today at ${time}` : `Last seen ${d.toLocaleDateString()} at ${time}`;
  }

  function moveGroupToTop(groupId) {
    const i = groups.findIndex(g => String(g._id) === String(groupId));
    if (i > 0) groups.unshift(groups.splice(i, 1)[0]);
  }
  function moveFriendToTop(friendId) {
    const i = friends.findIndex(f => String(f._id) === String(friendId));
    if (i > 0) friends.unshift(friends.splice(i, 1)[0]);
  }
  function insertEmojiAtCursor(emoji) {
    const start = messageInput.selectionStart ?? messageInput.value.length;
    const end = messageInput.selectionEnd ?? messageInput.value.length;
    messageInput.value = messageInput.value.slice(0, start) + emoji + messageInput.value.slice(end);
    const pos = start + emoji.length;
    messageInput.focus();
    messageInput.setSelectionRange(pos, pos);
    messageInput.dispatchEvent(new Event('input'));
  }

  function avatarWithDotHtml(userObj, opts = {}) {
    const size = opts.size || 36;
    const bg = userObj.avatarColor || colorFor(userObj._id, userObj.name);
    const online = isOnline(userObj._id);
    return `
      <div class="avatar-with-dot" style="width:${size}px;height:${size}px;">
        <div class="group-avatar" style="width:${size}px;height:${size}px;font-size:${size <= 32 ? 12 : 14}px;background:${bg};">${initials(userObj.name)}</div>
        <span class="presence-dot${online ? '' : ' offline'}" data-presence-user="${userObj._id}"></span>
      </div>
    `;
  }

  // ---- Avatar / logout ----
  railAvatar.textContent = initials(user.name);
  railAvatar.style.background = user.avatarColor || colorFor(myId, user.name);
  railAvatar.addEventListener('click', () => {
    if (confirm(`Logged in as ${user.name} (${user.email}). Log out?`)) {
      clearSession();
      window.location.href = 'index.html';
    }
  });

  // ---- Socket.io ----
  const socket = io({ auth: { token } });
  const connectionBanner = document.getElementById('connectionBanner');
  socket.on('disconnect', () => connectionBanner?.classList.add('visible'));
  socket.on('connect', () => connectionBanner?.classList.remove('visible'));
  const presenceHeartbeat = setInterval(() => {
    if (socket.connected) socket.emit('presenceHeartbeat');
  }, 20000);
  window.addEventListener('beforeunload', () => clearInterval(presenceHeartbeat));
  socket.on('connect_error', (err) => {
    console.error('Socket connection error:', err.message);
    // If the server rejected the token (expired/invalid), the API calls will
    // also be failing - send the user back to log in instead of leaving them
    // on a dashboard that silently stops receiving real-time updates.
    if (/token/i.test(err.message)) {
      clearSession();
      window.location.href = 'index.html?sessionExpired=1';
    }
  });
  socket.on('notification', (notification) => {
    if (notification.type === 'friendRequest') {
      // friendRequest event maintains the request list/badge.
      return;
    }
    const key = `${notification.type}:${notification.sourceId}`;
    const activeSource =
      notification.type === 'group'
        ? activeChat && activeChat.type === 'group' && String(activeChat.id) === String(notification.sourceId)
        : activeChat && activeChat.type === 'dm' && activeChat.friend && String(activeChat.friend._id) === String(notification.sourceId);

    if (activeSource) {
      markSourceRead(notification.type, notification.sourceId);
      return;
    }

    unreadCounts.set(key, Number(unreadCounts.get(key) || 0) + Number(notification.count || 1));
    if (notification.type === 'group') moveGroupToTop(notification.sourceId);
    else if (notification.type === 'private') moveFriendToTop(notification.sourceId);
    updateTabBadges();
    renderList();
  });

  socket.on('onlineUsers', (ids) => {
    onlineUserIds = new Set(ids.map(String));
    refreshPresenceUI();
  });

  socket.on('presenceUpdate', ({ userId, online, lastSeen }) => {
    const id = String(userId);
    if (online) onlineUserIds.add(id);
    else {
      onlineUserIds.delete(id);
      const f = friends.find((fr) => fr._id === id);
      if (f && lastSeen) f.lastSeen = lastSeen;
    }
    refreshPresenceUI();
  });

  function refreshPresenceUI() {
    document.querySelectorAll('[data-presence-user]').forEach((el) => {
      const uid = el.getAttribute('data-presence-user');
      el.classList.toggle('offline', !isOnline(uid));
    });
    if (activeTab === 'friends') renderList();
    if (activeChat && activeChat.type === 'dm') updateDmHeaderPresence();
  }

  function updateDmHeaderPresence() {
    const f = activeChat.friend;
    const online = isOnline(f._id);
    chatHeaderDot.classList.remove('hidden');
    chatHeaderDot.classList.toggle('offline', !online);
    chatHeaderDot.setAttribute('data-presence-user', f._id);
    chatGroupMembers.innerHTML = online
      ? `<span class="last-seen-text" style="color:#107C10;">Online</span>`
      : `<span class="last-seen-text">${formatLastSeen(f.lastSeen)}</span>`;
  }

  socket.on('newMessage', (message) => {
    moveGroupToTop(message.group);
    if (activeTab === 'groups') renderList();
    if (activeChat && activeChat.type === 'group' && message.group === activeChat.id) {
      const shouldStickToBottom = isNearBottom() || String(message.sender?._id) === String(myId);
      renderMessage(message);
      if (shouldStickToBottom) scrollToBottom();
    }
  });
  socket.on('messageEdited', (message) => {
    const row = document.querySelector(`[data-message-id="${message._id}"]`);
    if (row) row.replaceWith(buildMessageRow(message, 'group'));
  });
  socket.on('newPrivateMessage', (message) => {
    const otherId = String(message.sender?._id) === String(myId) ? message.recipient?._id : message.sender?._id;
    if (otherId) moveFriendToTop(otherId);
    if (activeTab === 'friends') renderList();
    if (activeChat && activeChat.type === 'dm' && message.conversation === activeChat.id) {
      const shouldStickToBottom = isNearBottom() || String(message.sender?._id) === String(myId);
      renderMessage(message);
      if (shouldStickToBottom) scrollToBottom();
    }
  });
  socket.on('privateMessageEdited', (message) => {
    const row = document.querySelector(`[data-message-id="${message._id}"]`);
    if (row) row.replaceWith(buildMessageRow(message, 'dm'));
  });

  socket.on('userTyping', ({ name }) => showTyping(name));
  socket.on('privateTyping', ({ name }) => showTyping(name));
  function showTyping(name) {
    typingIndicator.textContent = `${name} is typing...`;
    clearTimeout(typingIndicator._t);
    typingIndicator._t = setTimeout(() => (typingIndicator.textContent = ''), 2000);
  }

  // Live group updates pushed from the server
  socket.on('groupUpdated', (updatedGroup) => applyUpdatedGroup(updatedGroup));
  socket.on('addedToGroup', (group) => {
    if (!groups.some((g) => g._id === group._id)) groups.unshift(group);
    else applyUpdatedGroup(group);
    if (activeTab === 'groups') renderList();
  });
  socket.on('removedFromGroup', ({ groupId }) => {
    groups = groups.filter((g) => g._id !== groupId);
    if (activeChat && activeChat.type === 'group' && activeChat.id === groupId) resetChatView();
    if (activeTab === 'groups') renderList();
  });
  socket.on('groupAdminUpdated', async () => {
    await loadGroups();
    if (activeTab === 'groups') renderList();
    if (activeChat && activeChat.type === 'group') {
      const updated = groups.find((g) => g._id === activeChat.id);
      if (updated) applyUpdatedGroup(updated);
    }
  });
  socket.on('groupDeleted', ({ groupId }) => {
    groups = groups.filter((g) => g._id !== groupId);
    if (activeChat && activeChat.type === 'group' && activeChat.id === groupId) resetChatView();
    if (activeTab === 'groups') renderList();
  });

  // Friend request live events
  socket.on('friendRequest', (request) => {
    incomingRequests.unshift(request);
    unreadRequestCount += 1;
    updateReqBadge();
    updateTabBadges();
    if (activeTab === 'requests') renderList();
  });
  socket.on('friendRequestUpdated', async ({ requestId, status }) => {
    const wasIncoming = incomingRequests.some(r => String(r._id) === String(requestId));
    incomingRequests = incomingRequests.filter(r => String(r._id) !== String(requestId));
    outgoingRequests = outgoingRequests.filter(r => String(r._id) !== String(requestId));
    if (wasIncoming && unreadRequestCount > 0) unreadRequestCount -= 1;
    updateReqBadge();
    updateTabBadges();
    if (activeTab === 'requests') renderList();
    if (status === 'accepted') await loadFriends();
    if (status === 'accepted' && activeTab === 'friends') renderList();
  });

  socket.on('friendAccepted', (friend) => {
    if (!friends.some(f => String(f._id) === String(friend._id))) {
      friends.unshift({ ...friend, displayName: friend.name, nickname: null });
    }
    outgoingRequests = outgoingRequests.filter((r) => String(r.recipient._id) !== String(friend._id));
    if (activeTab === 'friends' || activeTab === 'requests') renderList();
  });

  function updateReqBadge() {
    const count = incomingRequests.length;
    reqBadge.textContent = count > 99 ? '99+' : String(count);
    reqBadge.classList.toggle('hidden', count === 0);
    updateBrowserTabTitle();
  }

  async function markFriendRequestNotificationsRead() {
    const requests = [...incomingRequests];
    await Promise.all(requests.map(r =>
      markSourceRead('friendRequest', r._id).catch(() => {})
    ));
    unreadRequestCount = 0;
    updateBrowserTabTitle();
  }

  // ---- Tabs ----
  tabGroups.addEventListener('click', () => switchTab('groups'));
  tabFriends.addEventListener('click', () => switchTab('friends'));
  tabRequests.addEventListener('click', () => switchTab('requests'));

  async function switchTab(tab) {
    activeTab = tab;
    tabGroups.classList.toggle('active', tab === 'groups');
    tabFriends.classList.toggle('active', tab === 'friends');
    tabRequests.classList.toggle('active', tab === 'requests');
    sidebarTitle.textContent = tab === 'groups' ? 'Chats' : tab === 'friends' ? 'Friends' : 'Friend Requests';
    sidebarSearchWrap.classList.toggle('hidden', tab === 'requests');
    if (sidebarSearch) sidebarSearch.value = '';
    renderList();
    if (tab === 'requests' && unreadRequestCount > 0) {
      markFriendRequestNotificationsRead().catch(() => {});
    }
  }

  sidebarSearch.addEventListener('input', () => {
    if (activeTab !== 'requests') renderList();
  });

  newItemBtn.addEventListener('click', () => {
    if (activeTab === 'groups') openNewGroupModal();
    else openAddFriendModal();
  });

  // ---- Load data ----
  async function loadGroups() {
    try { groups = await apiRequest('/api/groups', { auth: true }); } catch (e) { console.error(e); }
  }
  async function loadFriends() {
    try { friends = await apiRequest('/api/friends', { auth: true }); } catch (e) { console.error(e); }
  }
  async function loadRequests() {
    try {
      const data = await apiRequest('/api/friends/requests', { auth: true });
      incomingRequests = data.incoming || [];
      outgoingRequests = data.outgoing || [];
      updateReqBadge();
    } catch (e) { console.error(e); }
  }

  function unreadBadgeHtml(key) {
    const count = Number(unreadCounts.get(key) || 0);
    return count > 0
      ? `<span class="message-unread-badge">${count > 99 ? '99+' : count}</span>`
      : '';
  }

  function totalUnreadMessages() {
    let total = 0;
    unreadCounts.forEach(v => { total += Number(v || 0); });
    return total;
  }

  // Keep the browser tab title in sync with unread notifications,
  // just like Gmail/WhatsApp-style unread counts.
  function updateBrowserTabTitle() {
    const total = totalUnreadMessages() + Number(unreadRequestCount || 0);
    const shown = total > 99 ? '99+' : String(total);
    document.title = total > 0 ? `(${shown}) TeamsChat` : 'TeamsChat';
  }

  function updateTabBadges() {
    const total = totalUnreadMessages();
    if (groupsBadge) {
      const groupTotal = Array.from(unreadCounts.entries())
        .filter(([k]) => k.startsWith('group:'))
        .reduce((sum, [, v]) => sum + Number(v || 0), 0);
      groupsBadge.textContent = groupTotal > 99 ? '99+' : String(groupTotal);
      groupsBadge.classList.toggle('hidden', groupTotal === 0);
    }
    if (friendsBadge) {
      const friendTotal = Array.from(unreadCounts.entries())
        .filter(([k]) => k.startsWith('private:'))
        .reduce((sum, [, v]) => sum + Number(v || 0), 0);
      friendsBadge.textContent = friendTotal > 99 ? '99+' : String(friendTotal);
      friendsBadge.classList.toggle('hidden', friendTotal === 0);
    }
    updateBrowserTabTitle();
  }

  async function loadNotifications() {
    try {
      const data = await apiRequest('/api/notifications', { auth: true });
      unreadCounts.clear();
      unreadRequestCount = 0;
      data.forEach(n => {
        const key = n.type === 'group'
          ? `group:${n.sourceId}`
          : n.type === 'private'
            ? `private:${n.sourceId}`
            : `request:${n.sourceId}`;
        if (n.type === 'friendRequest') {
          unreadRequestCount += Number(n.count || 1);
        } else {
          unreadCounts.set(key, Number(n.count || 1));
        }
      });
      updateReqBadge();
      updateTabBadges();
    } catch (e) { console.error('loadNotifications:', e); }
  }

  async function markSourceRead(type, sourceId) {
    try {
      await apiRequest('/api/notifications/read', {
        method: 'POST',
        auth: true,
        body: { type, sourceId: String(sourceId) }
      });
    } catch (e) { console.error('markSourceRead:', e); }
  }

  function clearUnread(type, sourceId) {
    const key = `${type}:${sourceId}`;
    unreadCounts.delete(key);
    updateTabBadges();
    renderList();
  }

  // ---- Rendering the sidebar list ----
  function renderList() {
    if (activeTab === 'groups') return renderGroups();
    if (activeTab === 'friends') return renderFriends();
    return renderRequests();
  }

  function renderGroups() {
    const query = sidebarSearch.value.trim().toLowerCase();
    const filtered = groups.filter((g) => g.name.toLowerCase().includes(query));
    if (filtered.length === 0) {
      groupList.innerHTML = `<div class="empty-groups">${groups.length === 0 ? 'No groups yet.<br>Click "＋" to create one.' : 'No matches.'}</div>`;
      return;
    }
    groupList.innerHTML = '';
    filtered.forEach((group) => {
      const div = document.createElement('div');
      div.className = 'group-item' + (activeChat && activeChat.type === 'group' && activeChat.id === group._id ? ' active' : '');
      div.innerHTML = `
        <div class="group-avatar" style="background:${colorFor(group._id, group.name)};">${initials(group.name)}</div>
        <div class="group-meta">
          <div class="g-name">${escapeHtml(group.name)}</div>
          <div class="g-sub">${group.members.length} member${group.members.length !== 1 ? 's' : ''}</div>
        </div>
        ${unreadBadgeHtml('group:' + group._id)}
      `;
      div.addEventListener('click', () => openGroup(group));
      groupList.appendChild(div);
    });
  }

  function renderFriends() {
    const query = sidebarSearch.value.trim().toLowerCase();
    const filtered = friends.filter((f) => {
      const dn = (f.displayName || f.name).toLowerCase();
      return dn.includes(query) || f.email.toLowerCase().includes(query);
    });
    if (filtered.length === 0) {
      groupList.innerHTML = `<div class="empty-groups">${friends.length === 0 ? 'No friends yet.<br>Click "＋" to send a friend request.' : 'No matches.'}</div>`;
      return;
    }
    groupList.innerHTML = '';
    filtered.forEach((friend) => {
      const div = document.createElement('div');
      div.className = 'group-item' + (activeChat && activeChat.type === 'dm' && activeChat.friend && activeChat.friend._id === friend._id ? ' active' : '');
      const name = friend.displayName || friend.name;
      const statusText = isOnline(friend._id) ? '<span style="color:#107C10;">Online</span>' : formatLastSeen(friend.lastSeen);
      div.innerHTML = `
        ${avatarWithDotHtml(friend, { size: 36 })}
        <div class="group-meta" style="flex:1;">
          <div class="g-name">${escapeHtml(name)}</div>
          <div class="g-sub">${statusText}</div>
        </div>
        ${unreadBadgeHtml('private:' + friend._id)}
        <button class="rename-icon-inline" title="Rename ${escapeHtml(friend.name)}">✏️</button>
      `;
      div.querySelector('.rename-icon-inline').addEventListener('click', (e) => {
        e.stopPropagation();
        renameFriend(friend);
      });
      div.addEventListener('click', () => openDm(friend));
      groupList.appendChild(div);
    });
  }

  function renderRequests() {
    const incomingHtml = incomingRequests.length
      ? incomingRequests.map((r) => `
          <div class="group-item" data-req-id="${r._id}">
            <div class="group-avatar" style="background:${colorFor(r.sender._id, r.sender.name)};">${initials(r.sender.name)}</div>
            <div class="group-meta" style="flex:1;">
              <div class="g-name">${escapeHtml(r.sender.name)}</div>
              <div class="g-sub">${escapeHtml(r.sender.email)}</div>
            </div>
            <div class="friend-row-actions">
              <button class="btn-accept" data-accept="${r._id}">Accept</button>
              <button class="btn-reject" data-reject="${r._id}">Reject</button>
            </div>
          </div>
        `).join('')
      : `<div class="empty-groups">No incoming requests</div>`;

    const outgoingHtml = outgoingRequests.length
      ? outgoingRequests.map((r) => `
          <div class="group-item">
            <div class="group-avatar" style="background:${colorFor(r.recipient._id, r.recipient.name)};">${initials(r.recipient.name)}</div>
            <div class="group-meta" style="flex:1;">
              <div class="g-name">${escapeHtml(r.recipient.name)}</div>
              <div class="g-sub">${escapeHtml(r.recipient.email)}</div>
            </div>
            <div class="pending-tag">Pending</div>
          </div>
        `).join('')
      : '';

    groupList.innerHTML = `
      <div class="sidebar-search" style="border-bottom:1px solid var(--border); padding:10px 12px;">
        <input type="text" id="userSearchInput" placeholder="Search people by name or email..." />
      </div>
      <div id="userSearchResults"></div>
      <div style="padding:10px 12px 4px; font-size:12px; color:var(--text-muted); text-transform:uppercase; font-weight:700;">Incoming</div>
      ${incomingHtml}
      ${outgoingRequests.length ? `<div style="padding:14px 12px 4px; font-size:12px; color:var(--text-muted); text-transform:uppercase; font-weight:700;">Sent</div>${outgoingHtml}` : ''}
    `;

    groupList.querySelectorAll('[data-accept]').forEach((btn) => btn.addEventListener('click', () => acceptRequest(btn.dataset.accept)));
    groupList.querySelectorAll('[data-reject]').forEach((btn) => btn.addEventListener('click', () => rejectRequest(btn.dataset.reject)));

    const searchInput = document.getElementById('userSearchInput');
    searchInput.addEventListener('input', () => performUserSearch(searchInput.value.trim()));
  }

  async function performUserSearch(query) {
    const resultsEl = document.getElementById('userSearchResults');
    if (!resultsEl) return;
    if (query.length < 2) { resultsEl.innerHTML = ''; return; }
    try {
      const results = await apiRequest(`/api/friends/search?q=${encodeURIComponent(query)}`, { auth: true });
      if (results.length === 0) { resultsEl.innerHTML = `<div class="empty-groups">No users found</div>`; return; }
      resultsEl.innerHTML = results.map((u) => `
        <div class="group-item" data-user-id="${u._id}">
          <div class="group-avatar" style="background:${colorFor(u._id, u.name)};">${initials(u.name)}</div>
          <div class="group-meta" style="flex:1;">
            <div class="g-name">${escapeHtml(u.name)}</div>
            <div class="g-sub">${escapeHtml(u.email)}</div>
          </div>
          ${u.isFriend ? `<div class="pending-tag">Friends</div>` : `<button class="btn-add-req" data-send-req="${escapeHtml(u.email)}">Add</button>`}
        </div>
      `).join('');
      resultsEl.querySelectorAll('[data-send-req]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          try {
            await apiRequest('/api/friends/request', { method: 'POST', auth: true, body: { email: btn.dataset.sendReq } });
            btn.outerHTML = `<div class="pending-tag">Pending</div>`;
            await loadRequests();
          } catch (err) { alert(err.message); }
        });
      });
    } catch (err) { console.error(err); }
  }

  async function acceptRequest(requestId) {
    try {
      const result = await apiRequest(`/api/friends/requests/${requestId}/accept`, { method: 'POST', auth: true });
      incomingRequests = incomingRequests.filter((r) => String(r._id) !== String(requestId));
      if (!friends.some(f => String(f._id) === String(result.friend._id))) {
        friends.unshift({ ...result.friend, displayName: result.friend.name, nickname: null });
      }
      updateReqBadge();
      renderList();
      await Promise.all([loadFriends(), loadRequests()]);
    } catch (err) { alert(err.message); }
  }

  async function rejectRequest(requestId) {
    try {
      await apiRequest(`/api/friends/requests/${requestId}/reject`, { method: 'POST', auth: true });
      incomingRequests = incomingRequests.filter((r) => String(r._id) !== String(requestId));
      updateReqBadge();
      renderList();
      await loadRequests();
    } catch (err) { alert(err.message); }
  }

  // ---- Rename friend (nickname, visible only to me) ----
  async function renameFriend(friend) {
    const current = friend.displayName || friend.name;
    const value = prompt(`Rename ${friend.name} to:`, current);
    if (value === null) return; // cancelled
    const nickname = value.trim();
    try {
      const updated = await apiRequest(`/api/friends/${friend._id}/nickname`, { method: 'PUT', auth: true, body: { nickname } });
      friends = friends.map((f) => (f._id === updated._id ? updated : f));
      if (activeChat && activeChat.type === 'dm' && activeChat.friend._id === updated._id) {
        activeChat.friend = updated;
        chatGroupName.textContent = updated.displayName || updated.name;
      }
      renderList();
    } catch (err) { alert(err.message); }
  }

  // ---- Opening a group chat ----
  async function openGroup(group) {
    leaveCurrentRoom();
    activeChat = { type: 'group', id: group._id, group };
    socket.emit('joinGroup', group._id);

    showChatPanel();
    chatHeaderDot.classList.add('hidden');
    chatAvatar.style.background = colorFor(group._id, group.name);
    chatAvatar.textContent = initials(group.name);
    chatGroupName.textContent = group.name;
    chatGroupMembers.textContent = group.members.map((m) => m.name).join(', ');

    const amAdmin = group.admins.some((a) => a._id === myId);
    manageGroupBtn.classList.toggle('hidden', !amAdmin);
    leaveGroupBtn.classList.remove('hidden');
    renameFriendBtn.classList.add('hidden');
    clearChatBtn.classList.add('hidden');

    cancelReply();
    renderList();
    await loadMessageHistory(`/api/messages/${group._id}`, 'group');
    clearUnread('group', group._id);
    await markSourceRead('group', group._id);
  }

  // ---- Opening a DM ----
  async function openDm(friend) {
    try {
      const conversation = await apiRequest('/api/private/conversations', { method: 'POST', auth: true, body: { userId: friend._id } });

      leaveCurrentRoom();
      activeChat = { type: 'dm', id: conversation._id, friend };
      socket.emit('joinConversation', conversation._id);

      showChatPanel();
      chatAvatar.style.background = friend.avatarColor || colorFor(friend._id, friend.name);
      chatAvatar.textContent = initials(friend.name);
      chatGroupName.textContent = friend.displayName || friend.name;
      updateDmHeaderPresence();

      manageGroupBtn.classList.add('hidden');
      leaveGroupBtn.classList.add('hidden');
      renameFriendBtn.classList.remove('hidden');
      clearChatBtn.classList.remove('hidden');

      cancelReply();

      // Clear the friend's unread badge immediately when opening the chat.
      // Use the friend's user ID because private notifications are keyed by
      // the sender/source user ID, not by the conversation ID.
      clearUnread('private', friend._id);
      await markSourceRead('private', friend._id);

      renderList();
      await loadMessageHistory(`/api/private/conversations/${conversation._id}/messages`, 'dm');
    } catch (err) {
      alert(err.message);
    }
  }

  function leaveCurrentRoom() {
    if (!activeChat) return;
    if (activeChat.type === 'group') socket.emit('leaveGroup', activeChat.id);
    if (activeChat.type === 'dm') socket.emit('leaveConversation', activeChat.id);
  }

  function showChatPanel() {
    noChatSelected.classList.add('hidden');
    activeChatEl.classList.remove('hidden');
    activeChatEl.style.display = 'flex';
  }

  async function loadMessageHistory(path, chatType) {
    chatMessages.innerHTML = `<div class="empty-groups">Loading messages...</div>`;
    try {
      const messages = await apiRequest(path, { auth: true });
      // Build all rows in an off-DOM fragment and append once. Appending each
      // message straight into the live chatMessages element (as before) forces
      // a reflow/repaint per message - with up to 500 messages that's what
      // made opening a busy chat feel sluggish.
      const fragment = document.createDocumentFragment();
      messages.forEach((m) => fragment.appendChild(buildMessageRow(m, chatType)));
      chatMessages.innerHTML = '';
      chatMessages.appendChild(fragment);
      scrollToBottom();
    } catch (err) {
      chatMessages.innerHTML = `<div class="empty-groups">Failed to load messages: ${err.message}</div>`;
    }
  }

  // ---- Rendering messages ----
  // Used for single incoming messages (socket events), where one reflow is fine.
  function renderMessage(message, chatType) {
    const type = chatType || (activeChat ? activeChat.type : 'group');
    chatMessages.appendChild(buildMessageRow(message, type));
  }

  function buildMessageRow(message, chatType) {
    const isOwn = message.sender._id === myId;
    const row = document.createElement('div');
    row.className = 'msg-row msg-wrap' + (isOwn ? ' own' : '');
    row.dataset.messageId = message._id;

    const time = new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const editedTag = message.edited ? `<span class="edited-tag"> (edited)</span>` : '';
    const showSenderName = chatType === 'group' && !isOwn;

    const replyQuoteHtml = message.replyTo
      ? `<div class="reply-quote"><div class="rq-name">${escapeHtml(message.replyTo.sender?.name || 'Unknown')}</div><div class="rq-text">${escapeHtml(message.replyTo.text || '')}</div></div>`
      : '';

    const bg = message.sender.avatarColor || colorFor(message.sender._id, message.sender.name);
    const online = isOnline(message.sender._id);

    row.innerHTML = `
      <div class="msg-row-inner">
        <div class="msg-avatar-wrap" style="position:relative;">
          <div class="msg-avatar" style="background:${bg}">${initials(message.sender.name)}</div>
          <span class="presence-dot${online ? '' : ' offline'}" data-presence-user="${message.sender._id}" style="width:9px;height:9px;bottom:-1px;right:-1px;"></span>
        </div>
        <div style="min-width:0;">
          ${showSenderName ? `<div class="msg-sender">${escapeHtml(message.sender.name)}</div>` : ''}
          <div class="msg-bubble-wrap">
            <div class="msg-bubble">
              ${replyQuoteHtml}
              <div class="msg-text">${escapeHtml(message.text)}</div>
            </div>
          </div>
          <div class="msg-time">${time}${editedTag}</div>
        </div>
      </div>
      <div class="msg-hover-actions">
        <button class="msg-reply-btn" title="Reply">↩️</button>
        ${isOwn ? `<button class="msg-edit-btn" title="Edit">✏️</button>` : ''}
      </div>
    `;

    row.querySelector('.msg-reply-btn').addEventListener('click', () => {
      setPendingReply({ messageId: message._id, senderName: message.sender.name, text: message.text });
    });

    if (isOwn) {
      const editBtn = row.querySelector('.msg-edit-btn');
      if (editBtn) editBtn.addEventListener('click', () => startEditingMessage(row, message, chatType));
    }

    return row;
  }

  function startEditingMessage(row, message, chatType) {
    const bubbleWrap = row.querySelector('.msg-bubble-wrap');
    const originalHtml = bubbleWrap.innerHTML;

    bubbleWrap.innerHTML = `
      <textarea class="msg-edit-input" rows="2">${escapeHtml(message.text)}</textarea>
      <div class="msg-edit-actions">
        <button class="save">Save</button>
        <button class="cancel">Cancel</button>
      </div>
    `;

    const textarea = bubbleWrap.querySelector('.msg-edit-input');
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    bubbleWrap.querySelector('.cancel').addEventListener('click', () => { bubbleWrap.innerHTML = originalHtml; });
    bubbleWrap.querySelector('.save').addEventListener('click', submitEdit);
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitEdit(); }
    });

    async function submitEdit() {
      const newText = textarea.value.trim();
      if (!newText) return;
      const path = chatType === 'group' ? `/api/messages/${message._id}` : `/api/private/messages/${message._id}`;
      try {
        await apiRequest(path, { method: 'PUT', auth: true, body: { text: newText } });
        // Server broadcasts messageEdited/privateMessageEdited to the room, which updates this row for everyone.
      } catch (err) {
        alert(err.message);
        bubbleWrap.innerHTML = originalHtml;
      }
    }
  }

  function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
  // True if the user is already at (or very near) the bottom of the message
  // list. Used to decide whether an incoming message should auto-scroll -
  // otherwise anyone scrolled up reading older messages gets yanked back
  // down every time a new message arrives.
  function isNearBottom() {
    return chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight < 120;
  }

  // ---- Reply preview ----
  function setPendingReply(reply) {
    pendingReply = reply;
    replyPreviewName.textContent = reply.senderName;
    replyPreviewText.textContent = reply.text;
    replyPreview.classList.remove('hidden');
    messageInput.focus();
  }
  function cancelReply() {
    pendingReply = null;
    replyPreview.classList.add('hidden');
  }
  cancelReplyBtn.addEventListener('click', cancelReply);

  // ---- Sending messages ----
  function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !activeChat) return;

    const replyTo = pendingReply ? pendingReply.messageId : undefined;

    if (activeChat.type === 'group') {
      moveGroupToTop(activeChat.id);
      if (activeTab === 'groups') renderList();
      socket.emit('sendMessage', { groupId: activeChat.id, text, replyTo });
    } else {
      moveFriendToTop(activeChat.friend._id);
      if (activeTab === 'friends') renderList();
      socket.emit('sendPrivateMessage', { conversationId: activeChat.id, text, replyTo });
    }
    messageInput.value = '';
    messageInput.style.height = 'auto';
    cancelReply();
  }

  emojiToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    emojiPicker.classList.toggle('hidden');
  });
  emojiPicker.querySelectorAll('[data-emoji]').forEach((btn) => {
    btn.addEventListener('click', () => {
      insertEmojiAtCursor(btn.dataset.emoji);
      emojiPicker.classList.add('hidden');
    });
  });
  document.addEventListener('click', (e) => {
    if (!emojiPicker.contains(e.target) && e.target !== emojiToggle) emojiPicker.classList.add('hidden');
  });

  clearChatBtn.addEventListener('click', async () => {
    if (!activeChat || activeChat.type !== 'dm') return;
    const friendName = activeChat.friend.displayName || activeChat.friend.name;
    if (!confirm(`Clear your chat history with ${friendName}? This only clears it from your account.`)) return;
    try {
      await apiRequest(`/api/private/conversations/${activeChat.id}/messages`, { method: 'DELETE', auth: true });
      chatMessages.innerHTML = '<div class="empty-groups">Chat history cleared.</div>';
      cancelReply();
    } catch (err) { alert(err.message); }
  });

  sendBtn.addEventListener('click', sendMessage);
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto';
    messageInput.style.height = messageInput.scrollHeight + 'px';
    if (activeChat) {
      // Only emit 'typing' once every 2s per burst of keystrokes, instead of
      // on every keystroke. Previously `typingTimeout` was never assigned by
      // setTimeout, so clearTimeout() was a no-op and every keystroke fired a
      // socket event to the whole room - noisy traffic and a flickery
      // "X is typing..." indicator for everyone else.
      if (!typingTimeout) {
        if (activeChat.type === 'group') socket.emit('typing', { groupId: activeChat.id });
        else socket.emit('privateTyping', { conversationId: activeChat.id });
      }
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => { typingTimeout = null; }, 2000);
    }
  });

  // ---- New group modal ----
  function openNewGroupModal() {
    newGroupAlert.innerHTML = '';
    document.getElementById('groupName').value = '';
    document.getElementById('groupDesc').value = '';
    document.getElementById('groupMembers').value = '';
    newGroupModal.classList.remove('hidden');
  }
  cancelNewGroup.addEventListener('click', () => newGroupModal.classList.add('hidden'));
  newGroupModal.addEventListener('click', (e) => { if (e.target === newGroupModal) newGroupModal.classList.add('hidden'); });

  createGroupBtn.addEventListener('click', async () => {
    const name = document.getElementById('groupName').value.trim();
    const description = document.getElementById('groupDesc').value.trim();
    const membersRaw = document.getElementById('groupMembers').value.trim();
    if (!name) { newGroupAlert.innerHTML = `<div class="alert alert-error">Group name is required</div>`; return; }
    const memberEmails = membersRaw ? membersRaw.split(',').map((e) => e.trim()).filter(Boolean) : [];
    try {
      const group = await apiRequest('/api/groups', { method: 'POST', auth: true, body: { name, description, memberEmails } });
      groups.unshift(group);
      newGroupModal.classList.add('hidden');
      renderList();
      openGroup(group);
    } catch (err) {
      newGroupAlert.innerHTML = `<div class="alert alert-error">${err.message}</div>`;
    }
  });

  // ---- Add friend (send request) modal ----
  function openAddFriendModal() {
    addFriendAlert.innerHTML = '';
    document.getElementById('friendEmail').value = '';
    addFriendModal.classList.remove('hidden');
  }
  cancelAddFriend.addEventListener('click', () => addFriendModal.classList.add('hidden'));
  addFriendModal.addEventListener('click', (e) => { if (e.target === addFriendModal) addFriendModal.classList.add('hidden'); });

  confirmAddFriend.addEventListener('click', async () => {
    const email = document.getElementById('friendEmail').value.trim();
    if (!email) return;
    try {
      await apiRequest('/api/friends/request', { method: 'POST', auth: true, body: { email } });
      addFriendModal.classList.add('hidden');
      await loadRequests();
      if (activeTab === 'requests') renderList();
      else switchTab('requests');
    } catch (err) {
      addFriendAlert.innerHTML = `<div class="alert alert-error">${err.message}</div>`;
    }
  });

  // ---- Add member to existing group (admins only) ----
  function openAddMemberModal() {
    addMemberAlert.innerHTML = '';
    document.getElementById('memberEmail').value = '';
    addMemberModal.classList.remove('hidden');
  }
  cancelAddMember.addEventListener('click', () => addMemberModal.classList.add('hidden'));
  addMemberModal.addEventListener('click', (e) => { if (e.target === addMemberModal) addMemberModal.classList.add('hidden'); });
  openAddMemberFromManage.addEventListener('click', () => { manageGroupModal.classList.add('hidden'); openAddMemberModal(); });

  confirmAddMember.addEventListener('click', async () => {
    const email = document.getElementById('memberEmail').value.trim();
    if (!email || !activeChat || activeChat.type !== 'group') return;
    try {
      const updatedGroup = await apiRequest(`/api/groups/${activeChat.id}/members`, { method: 'POST', auth: true, body: { email } });
      applyUpdatedGroup(updatedGroup);
      addMemberModal.classList.add('hidden');
    } catch (err) {
      addMemberAlert.innerHTML = `<div class="alert alert-error">${err.message}</div>`;
    }
  });

  // ---- Manage group (admins) ----
  manageGroupBtn.addEventListener('click', () => {
    if (!activeChat || activeChat.type !== 'group') return;
    manageGroupAlert.innerHTML = '';
    renderManageMemberList(activeChat.group);
    manageGroupModal.classList.remove('hidden');
  });
  closeManageGroup.addEventListener('click', () => manageGroupModal.classList.add('hidden'));
  manageGroupModal.addEventListener('click', (e) => { if (e.target === manageGroupModal) manageGroupModal.classList.add('hidden'); });

  function renderManageMemberList(group) {
    const amAdmin = group.admins.some((a) => a._id === myId);
    manageMemberList.innerHTML = '';
    group.members.forEach((member) => {
      const memberIsAdmin = group.admins.some((a) => a._id === member._id);
      const row = document.createElement('div');
      row.className = 'member-row';
      row.innerHTML = `
        <div class="group-avatar" style="width:32px;height:32px;font-size:12px;background:${colorFor(member._id, member.name)};">${initials(member.name)}</div>
        <div class="member-info">
          <div class="member-name">${escapeHtml(member.name)}${memberIsAdmin ? '<span class="admin-badge">ADMIN</span>' : ''}</div>
          <div class="member-email">${escapeHtml(member.email)}</div>
        </div>
        <div class="member-actions"></div>
      `;
      const actions = row.querySelector('.member-actions');
      if (amAdmin && member._id !== myId) {
        if (!memberIsAdmin) {
          const promoteBtn = document.createElement('button');
          promoteBtn.textContent = 'Make admin';
          promoteBtn.addEventListener('click', () => promoteMember(member._id));
          actions.appendChild(promoteBtn);
        } else if (group.admins.length > 1) {
          const demoteBtn = document.createElement('button');
          demoteBtn.textContent = 'Remove admin';
          demoteBtn.addEventListener('click', () => demoteMember(member._id));
          actions.appendChild(demoteBtn);
        }
        const removeBtn = document.createElement('button');
        removeBtn.textContent = 'Remove';
        removeBtn.className = 'danger';
        removeBtn.addEventListener('click', () => removeMember(member._id, member.name));
        actions.appendChild(removeBtn);
      }
      manageMemberList.appendChild(row);
    });
  }

  async function promoteMember(userId) {
    try {
      const updated = await apiRequest(`/api/groups/${activeChat.id}/admins/${userId}`, { method: 'POST', auth: true });
      applyUpdatedGroup(updated);
      renderManageMemberList(updated);
    } catch (err) { manageGroupAlert.innerHTML = `<div class="alert alert-error">${err.message}</div>`; }
  }
  async function demoteMember(userId) {
    try {
      const updated = await apiRequest(`/api/groups/${activeChat.id}/admins/${userId}`, { method: 'DELETE', auth: true });
      applyUpdatedGroup(updated);
      renderManageMemberList(updated);
    } catch (err) { manageGroupAlert.innerHTML = `<div class="alert alert-error">${err.message}</div>`; }
  }
  async function removeMember(userId, name) {
    if (!confirm(`Remove ${name} from the group?`)) return;
    try {
      const result = await apiRequest(`/api/groups/${activeChat.id}/members/${userId}`, { method: 'DELETE', auth: true });
      if (result.deleted) {
        groups = groups.filter((g) => g._id !== activeChat.id);
        manageGroupModal.classList.add('hidden');
        resetChatView();
        renderList();
        return;
      }
      applyUpdatedGroup(result);
      renderManageMemberList(result);
    } catch (err) { manageGroupAlert.innerHTML = `<div class="alert alert-error">${err.message}</div>`; }
  }

  function applyUpdatedGroup(updatedGroup) {
    groups = groups.map((g) => (g._id === updatedGroup._id ? updatedGroup : g));
    if (!groups.some((g) => g._id === updatedGroup._id)) groups.unshift(updatedGroup);
    if (activeChat && activeChat.type === 'group' && activeChat.id === updatedGroup._id) {
      activeChat.group = updatedGroup;
      chatGroupMembers.textContent = updatedGroup.members.map((m) => m.name).join(', ');
      const amAdmin = updatedGroup.admins.some((a) => a._id === myId);
      manageGroupBtn.classList.toggle('hidden', !amAdmin);
    }
    if (activeTab === 'groups') renderList();
  }

  // ---- Leave group ----
  leaveGroupBtn.addEventListener('click', async () => {
    if (!activeChat || activeChat.type !== 'group') return;
    if (!confirm(`Leave "${activeChat.group.name}"?`)) return;
    try {
      await apiRequest(`/api/groups/${activeChat.id}/leave`, { method: 'POST', auth: true });
      groups = groups.filter((g) => g._id !== activeChat.id);
      resetChatView();
      renderList();
    } catch (err) { alert(err.message); }
  });

  function resetChatView() {
    leaveCurrentRoom();
    activeChat = null;
    clearChatBtn.classList.add('hidden');
    cancelReply();
    activeChatEl.classList.add('hidden');
    activeChatEl.style.display = 'none';
    noChatSelected.classList.remove('hidden');
  }

  // ---- Init ----
  (async function initLoad() {
    groupList.innerHTML = `<div class="empty-groups">Loading...</div>`;
    await Promise.all([loadGroups(), loadFriends(), loadRequests(), loadNotifications()]);
    renderList();
  })();
}
