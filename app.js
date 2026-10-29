/* THELOVE — frontend app
   Điền SUPABASE_URL và SUPABASE_PUBLISHABLE_KEY bên dưới.
   Chỉ dùng publishable/anon key ở frontend. Không bao giờ dùng service_role/secret key. */

const SUPABASE_URL = "https://tlxogcnnwvigxwiqvcff.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_0KSi8iblywjJRRrnXdmloA_FhzqiAA-";

let supabaseClient = null;
let currentUser = null;
let currentProfile = null;
let activeChatProfile = null;
let messagesSubscription = null;
let selectedAvatarFile = null;
let toastTimer = null;

const $ = (id) => document.getElementById(id);
const isConfigured = () =>
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("PASTE_YOUR") &&
  SUPABASE_PUBLISHABLE_KEY &&
  !SUPABASE_PUBLISHABLE_KEY.includes("PASTE_YOUR");

function notify(message) {
  const el = $("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 4200);
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);
}

function avatarMarkup(profile, extraClass = "") {
  const name = escapeHtml(profile?.display_name || "Người dùng");
  if (profile?.avatar_url) {
    return `<img class="${extraClass}" src="${escapeHtml(profile.avatar_url)}" alt="${name}" referrerpolicy="no-referrer">`;
  }
  return "♡";
}

function setAvatarElement(el, profile) {
  if (!el) return;
  if (profile?.avatar_url) {
    el.innerHTML = `<img src="${escapeHtml(profile.avatar_url)}" alt="Ảnh đại diện">`;
  } else {
    el.textContent = "♡";
  }
}

function showPage(page) {
  if (!currentUser) {
    $("authView").classList.remove("hidden");
    $("setupView").classList.add("hidden");
    $("appView").classList.add("hidden");
    if (page !== "home") notify("Bạn cần đăng nhập trước nhé.");
    return;
  }
  $("authView").classList.add("hidden");
  $("setupView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  document.querySelectorAll(".page").forEach(el => el.classList.add("hidden"));
  const target = $("page-" + page);
  if (target) target.classList.remove("hidden");
  document.querySelectorAll("[data-page]").forEach(el => {
    el.classList.toggle("active", el.dataset.page === page);
  });
  if (page === "discover") $("peopleSearch")?.focus();
  if (page === "following") loadFollowing();
  if (page === "messages") loadConversations();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function loginGoogle() {
  if (!isConfigured()) {
    notify("Hãy mở app.js và điền Supabase Project URL cùng Publishable key trước.");
    return;
  }
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin + window.location.pathname }
  });
  if (error) notify("Không thể đăng nhập: " + error.message);
}

async function handleSession(session) {
  currentUser = session?.user || null;
  if (!currentUser) {
    currentProfile = null;
    $("authView").classList.remove("hidden");
    $("setupView").classList.add("hidden");
    $("appView").classList.add("hidden");
    return;
  }
  await loadMyProfile();
}

async function loadMyProfile() {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (error) {
    console.error(error);
    notify("Không tải được hồ sơ. Hãy kiểm tra bảng profiles và RLS trong Supabase.");
    return;
  }
  currentProfile = data;
  if (!data) {
    $("authView").classList.add("hidden");
    $("appView").classList.add("hidden");
    $("setupView").classList.remove("hidden");
    const metadata = currentUser.user_metadata || {};
    if (!$("displayName").value) $("displayName").value = metadata.full_name || metadata.name || "";
    return;
  }
  $("authView").classList.add("hidden");
  $("setupView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  renderMyProfile();
  await loadSuggestedPeople();
  showPage("home");
}

function renderMyProfile() {
  if (!currentProfile) return;
  $("welcomeName").textContent = currentProfile.display_name || currentProfile.username;
  $("profileDisplayName").textContent = currentProfile.display_name || "";
  $("profileUsername").textContent = currentProfile.username || "";
  $("profileAge").textContent = currentProfile.age ? `${currentProfile.age} tuổi` : "";
  $("profileBio").textContent = currentProfile.bio || "";
  setAvatarElement($("topAvatar"), currentProfile);
  setAvatarElement($("profileAvatar"), currentProfile);
}

async function uploadAvatar(file) {
  if (!file) return null;
  if (!file.type.startsWith("image/")) throw new Error("Vui lòng chọn tệp ảnh.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Ảnh phải nhỏ hơn 5 MB.");
  const ext = (file.name.split(".").pop() || "jpg").replace(/[^a-z0-9]/gi, "").toLowerCase();
  const path = `${currentUser.id}/${Date.now()}.${ext || "jpg"}`;
  const { error } = await supabaseClient.storage.from("avatars").upload(path, file, {
    upsert: true, contentType: file.type
  });
  if (error) throw error;
  const { data } = supabaseClient.storage.from("avatars").getPublicUrl(path);
  return data.publicUrl;
}

async function saveProfile(event) {
  event.preventDefault();
  if (!currentUser) return;
  const display_name = $("displayName").value.trim();
  const username = $("username").value.trim().toLowerCase();
  const age = Number($("age").value);
  const bio = $("bio").value.trim();
  if (!/^@[a-z0-9_]{3,24}$/.test(username)) {
    notify("ID phải bắt đầu bằng @ và có 3–24 ký tự chữ thường, số hoặc _.");
    return;
  }
  if (!display_name) return notify("Vui lòng nhập tên hiển thị.");
  if (!Number.isInteger(age) || age < 13 || age > 120) return notify("Tuổi phải từ 13 đến 120.");
  const button = $("profileForm").querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = "Đang lưu...";
  try {
    let avatar_url = currentProfile?.avatar_url || null;
    if (selectedAvatarFile) avatar_url = await uploadAvatar(selectedAvatarFile);
    const payload = { id: currentUser.id, username, display_name, age, bio, avatar_url, updated_at: new Date().toISOString() };
    const { error } = await supabaseClient.from("profiles").upsert(payload, { onConflict: "id" });
    if (error) {
      if (error.code === "23505") throw new Error("ID này đã được sử dụng. Hãy chọn ID khác.");
      throw error;
    }
    selectedAvatarFile = null;
    await loadMyProfile();
    notify("Đã lưu hồ sơ TheLOVE!");
  } catch (err) {
    console.error(err);
    notify(err.message || "Không thể lưu hồ sơ.");
  } finally {
    button.disabled = false;
    button.textContent = "Hoàn tất hồ sơ →";
  }
}

async function loadSuggestedPeople() {
  if (!currentUser) return;
  const { data, error } = await supabaseClient.from("profiles")
    .select("id,username,display_name,age,avatar_url,bio")
    .neq("id", currentUser.id).order("created_at", { ascending: false }).limit(9);
  if (error) {
    console.error(error);
    $("suggestedPeople").innerHTML = '<div class="empty-state">Chưa tải được danh sách. Kiểm tra cấu hình bảng profiles.</div>';
    return;
  }
  renderPeople($("suggestedPeople"), data || []);
}

function personCard(profile) {
  return `<article class="person-card">
    <div class="person-card-top"><div class="person-avatar">${avatarMarkup(profile)}</div>
      <div><h3>${escapeHtml(profile.display_name || "Người dùng")}</h3><div class="username">${escapeHtml(profile.username || "")}${profile.age ? " · " + Number(profile.age) + " tuổi" : ""}</div></div>
    </div>
    <p class="bio">${escapeHtml(profile.bio || "Chưa có phần giới thiệu.")}</p>
    <div class="card-actions">
      <button class="secondary-button" data-action="follow" data-id="${escapeHtml(profile.id)}">♡ Theo dõi</button>
      <button class="primary-button" data-action="chat" data-id="${escapeHtml(profile.id)}">Nhắn tin</button>
    </div>
  </article>`;
}

function renderPeople(container, people) {
  if (!container) return;
  if (!people.length) {
    container.innerHTML = '<div class="empty-state">Chưa tìm thấy người dùng phù hợp.</div>';
    return;
  }
  container.innerHTML = people.map(personCard).join("");
}

async function searchPeople(event) {
  if (event?.preventDefault) event.preventDefault();
  if (!currentUser) return notify("Bạn cần đăng nhập trước nhé.");
  const query = ($("peopleSearch")?.value || $("globalSearch")?.value || "").trim();
  if (!query) return notify("Nhập tên hoặc @ID bạn muốn tìm.");
  $("peopleSearch").value = query;
  $("globalSearch").value = query;
  showPage("discover");
  $("searchResults").innerHTML = '<div class="empty-state">Đang tìm kiếm...</div>';
  const safe = query.replace(/[,%()]/g, " ").trim();
  const { data, error } = await supabaseClient.from("profiles")
    .select("id,username,display_name,age,avatar_url,bio")
    .neq("id", currentUser.id)
    .or(`username.ilike.%${safe}%,display_name.ilike.%${safe}%`)
    .limit(30);
  if (error) {
    console.error(error);
    $("searchResults").innerHTML = '<div class="empty-state">Không thể tìm kiếm. Hãy kiểm tra cấu hình Supabase.</div>';
    return;
  }
  renderPeople($("searchResults"), data || []);
}

async function followUser(targetId) {
  const { error } = await supabaseClient.from("follows").insert({
    follower_id: currentUser.id, following_id: targetId
  });
  if (error?.code === "23505") return notify("Bạn đã theo dõi người này rồi.");
  if (error) return notify("Không thể theo dõi: " + error.message);
  notify("Đã theo dõi người dùng.");
  await loadFollowing();
}

async function loadFollowing() {
  if (!currentUser) return;
  const { data, error } = await supabaseClient.from("follows")
    .select("following_id, profiles:following_id(id,username,display_name,age,avatar_url,bio)")
    .eq("follower_id", currentUser.id);
  if (error) {
    console.error(error);
    $("followingList").innerHTML = '<div class="empty-state">Không tải được danh sách. Có thể cần kiểm tra relationship của bảng follows.</div>';
    return;
  }
  renderPeople($("followingList"), (data || []).map(row => row.profiles).filter(Boolean));
}

async function startChat(profileId) {
  const { data, error } = await supabaseClient.from("profiles")
    .select("id,username,display_name,age,avatar_url,bio").eq("id", profileId).single();
  if (error) return notify("Không thể mở hồ sơ người nhận.");
  activeChatProfile = data;
  $("chatName").textContent = data.display_name || data.username;
  $("chatUsername").textContent = data.username;
  setAvatarElement($("chatAvatar"), data);
  $("chatEmpty").classList.add("hidden");
  $("chatActive").classList.remove("hidden");
  showPage("messages");
  await loadMessages();
  await loadConversations();
  subscribeMessages();
}

function closeChat() {
  activeChatProfile = null;
  if (messagesSubscription) supabaseClient.removeChannel(messagesSubscription);
  messagesSubscription = null;
  $("chatActive").classList.add("hidden");
  $("chatEmpty").classList.remove("hidden");
}

function renderMessages(rows) {
  const box = $("chatMessages");
  box.innerHTML = (rows || []).map(msg => {
    const mine = msg.sender_id === currentUser.id;
    const time = new Date(msg.created_at).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
    return `<div class="bubble ${mine ? "mine" : "theirs"}">${escapeHtml(msg.content)}<time>${time}</time></div>`;
  }).join("");
  box.scrollTop = box.scrollHeight;
}

async function loadMessages() {
  if (!activeChatProfile) return;
  const otherId = activeChatProfile.id;
  const { data, error } = await supabaseClient.from("messages").select("*")
    .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${currentUser.id})`)
    .order("created_at", { ascending: true }).limit(300);
  if (error) {
    console.error(error);
    notify("Không tải được tin nhắn. Hãy kiểm tra bảng messages và chính sách RLS.");
    return;
  }
  renderMessages(data || []);
}

function subscribeMessages() {
  if (messagesSubscription) supabaseClient.removeChannel(messagesSubscription);
  if (!activeChatProfile) return;
  const otherId = activeChatProfile.id;
  messagesSubscription = supabaseClient.channel("messages-" + currentUser.id + "-" + otherId)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, payload => {
      const msg = payload.new;
      if ((msg.sender_id === currentUser.id && msg.receiver_id === otherId) ||
          (msg.sender_id === otherId && msg.receiver_id === currentUser.id)) loadMessages();
    }).subscribe();
}

async function sendMessage(event) {
  event.preventDefault();
  if (!activeChatProfile) return notify("Hãy chọn người nhận trước.");
  const input = $("messageInput");
  const content = input.value.trim();
  if (!content) return;
  input.disabled = true;
  const { error } = await supabaseClient.from("messages").insert({
    sender_id: currentUser.id, receiver_id: activeChatProfile.id, content
  });
  input.disabled = false;
  if (error) return notify("Không gửi được tin nhắn: " + error.message);
  input.value = "";
  await loadMessages();
}

async function loadConversations() {
  if (!currentUser) return;
  const { data, error } = await supabaseClient.from("messages")
    .select("sender_id,receiver_id,content,created_at")
    .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
    .order("created_at", { ascending: false }).limit(300);
  if (error) {
    console.error(error);
    return;
  }
  const latest = new Map();
  (data || []).forEach(m => {
    const otherId = m.sender_id === currentUser.id ? m.receiver_id : m.sender_id;
    if (!latest.has(otherId)) latest.set(otherId, m);
  });
  const ids = [...latest.keys()];
  const list = $("conversationList");
  if (!ids.length) {
    list.innerHTML = '<div class="empty-state">Chưa có cuộc trò chuyện. Hãy tìm bạn và bắt đầu nhắn tin!</div>';
    return;
  }
  const { data: profiles, error: profileError } = await supabaseClient.from("profiles")
    .select("id,username,display_name,avatar_url").in("id", ids);
  if (profileError) return;
  const byId = new Map((profiles || []).map(p => [p.id, p]));
  list.innerHTML = ids.map(id => {
    const p = byId.get(id);
    if (!p) return "";
    const m = latest.get(id);
    return `<button class="conversation-item" data-action="chat" data-id="${escapeHtml(id)}"><div class="person-avatar">${avatarMarkup(p)}</div><div><b>${escapeHtml(p.display_name || p.username)}</b><small>${escapeHtml(m.content.slice(0, 45))}</small></div></button>`;
  }).join("");
}

async function editProfile() {
  if (!currentProfile) return;
  $("displayName").value = currentProfile.display_name || "";
  $("username").value = currentProfile.username || "";
  $("age").value = currentProfile.age || "";
  $("bio").value = currentProfile.bio || "";
  selectedAvatarFile = null;
  if (currentProfile.avatar_url) {
    $("avatarPreview").src = currentProfile.avatar_url;
    $("avatarPreview").classList.remove("hidden");
    $("avatarPlaceholder").classList.add("hidden");
  } else {
    $("avatarPreview").classList.add("hidden");
    $("avatarPlaceholder").classList.remove("hidden");
  }
  $("appView").classList.add("hidden");
  $("setupView").classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function shareLocation() {
  if (!navigator.geolocation) return notify("Trình duyệt này không hỗ trợ định vị.");
  $("locationStatus").textContent = "Đang xin quyền truy cập vị trí...";
  navigator.geolocation.getCurrentPosition(
    pos => {
      const lat = pos.coords.latitude.toFixed(5);
      const lon = pos.coords.longitude.toFixed(5);
      $("locationStatus").textContent = `Bạn đã cho phép lấy vị trí hiện tại. Tọa độ: ${lat}, ${lon}. Vị trí chưa được gửi cho người khác.`;
      notify("Đã lấy vị trí. Chức năng chia sẻ vị trí cho bạn bè sẽ được bổ sung sau.");
    },
    err => {
      $("locationStatus").textContent = err.code === 1 ? "Bạn chưa cấp quyền định vị." : "Không thể lấy vị trí lúc này.";
      notify("Không lấy được vị trí. Hãy kiểm tra quyền Location của trình duyệt.");
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
  );
}

async function switchAccount() {
  if (!confirm("Đăng xuất tài khoản hiện tại để đổi tài khoản?")) return;
  if (messagesSubscription) supabaseClient.removeChannel(messagesSubscription);
  await supabaseClient.auth.signOut();
  currentUser = null; currentProfile = null; activeChatProfile = null;
  showPage("home");
}



async function deleteAccount() {
  if (!supabaseClient) {
    notify("Supabase chưa được khởi tạo. Hãy tải lại trang.");
    return;
  }

  const confirmed = confirm(
    "Bạn có chắc chắn muốn xóa tài khoản TheLOVE không?\n\n" +
    "Thao tác này không thể dễ dàng hoàn tác."
  );

  if (!confirmed) return;

  try {
    notify("Đang xử lý yêu cầu xóa tài khoản...");

    const {
      data: { session },
      error: sessionError,
    } = await supabaseClient.auth.getSession();

    if (sessionError) {
      console.error("Session error:", sessionError);
      notify("Không kiểm tra được phiên đăng nhập.");
      return;
    }

    if (!session) {
      notify("Bạn chưa đăng nhập. Vui lòng đăng nhập lại.");
      return;
    }

    const { data, error } = await supabaseClient.functions.invoke(
      "delete-account",
      { body: {} }
    );

    if (error) {
      console.error("Edge Function error:", error);
      console.error("Response data:", data);
      notify(
        "Xóa tài khoản thất bại: " +
        (data?.error || error.message || "Không thể kết nối máy chủ.")
      );
      return;
    }

    if (!data?.ok) {
      console.error("Delete account failed:", data);
      notify(data?.error || "Máy chủ chưa xác nhận xóa tài khoản.");
      return;
    }

    await supabaseClient.auth.signOut({ scope: "local" });

    alert("Tài khoản đăng nhập đã được xóa.");

    window.location.reload();
  } catch (error) {
    console.error("Delete account exception:", error);
    notify("Xóa tài khoản thất bại. Hãy mở Console để xem lỗi.");
  }
}
function bindEvents() {
  $("googleLogin").addEventListener("click", loginGoogle);
  $("profileForm").addEventListener("submit", saveProfile);
  $("globalSearchForm").addEventListener("submit", searchPeople);
  $("peopleSearchForm").addEventListener("submit", searchPeople);
  $("messageForm").addEventListener("submit", sendMessage);
  $("closeChat").addEventListener("click", closeChat);
  $("editProfile").addEventListener("click", editProfile);
  $("shareLocation").addEventListener("click", shareLocation);
  $("switchAccount").addEventListener("click", switchAccount);
  $("deleteAccount").addEventListener("click", deleteAccount);

  $("avatarFile").addEventListener("change", event => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return notify("Hãy chọn một tệp ảnh.");
    if (file.size > 5 * 1024 * 1024) return notify("Ảnh phải nhỏ hơn 5 MB.");
    selectedAvatarFile = file;
    $("avatarPreview").src = URL.createObjectURL(file);
    $("avatarPreview").classList.remove("hidden");
    $("avatarPlaceholder").classList.add("hidden");
  });

  document.addEventListener("click", async event => {
    const pageButton = event.target.closest("[data-page]");
    if (pageButton) {
      event.preventDefault();
      showPage(pageButton.dataset.page);
      return;
    }
    const action = event.target.closest("[data-action]");
    if (!action || !currentUser) return;
    const id = action.dataset.id;
    if (action.dataset.action === "follow") await followUser(id);
    if (action.dataset.action === "chat") await startChat(id);
  });
}

async function init() {
  bindEvents();
  if (!isConfigured()) {
    $("configHint").textContent = "Mở app.js và thay hai giá trị PASTE_YOUR... bằng Project URL và Publishable key của Supabase.";
    return;
  }
  if (!window.supabase?.createClient) {
    notify("Không tải được thư viện Supabase. Kiểm tra kết nối Internet.");
    return;
  }
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const { data: { session } } = await supabaseClient.auth.getSession();
  await handleSession(session);
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => handleSession(session), 0);
  });
}

document.addEventListener("DOMContentLoaded", init);
