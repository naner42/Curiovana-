// script.js - Curiovana (simple Firebase + GitHub Pages)
// ====== REPLACE firebaseConfig BELOW with YOUR Firebase config ======
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
// ===================================================================

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

const googleSignInBtn = document.getElementById('googleSignInBtn');
const signOutBtn = document.getElementById('signOutBtn');
const userInfo = document.getElementById('userInfo');
const uploadArea = document.getElementById('upload-area');
const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const uploadStatus = document.getElementById('uploadStatus');
const postsDiv = document.getElementById('posts');

// Sign in with Google
googleSignInBtn.addEventListener('click', () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).catch(err => alert('Sign in error: ' + err.message));
});

// Sign out
signOutBtn.addEventListener('click', () => auth.signOut());

// Auth state change
auth.onAuthStateChanged(user => {
  if (user) {
    userInfo.textContent = `Signed in: ${user.displayName || user.email}`;
    googleSignInBtn.style.display = 'none';
    signOutBtn.style.display = 'inline-block';
    uploadArea.style.display = 'block';
  } else {
    userInfo.textContent = '';
    googleSignInBtn.style.display = 'inline-block';
    signOutBtn.style.display = 'none';
    uploadArea.style.display = 'none';
  }
  // always load posts (anonymous users can still view)
  startPostsListener();
});

// Upload file
uploadBtn.addEventListener('click', async () => {
  const file = fileInput.files[0];
  if (!file) { alert('Choose a file first'); return; }
  if (!auth.currentUser) { alert('You must sign in to upload'); return; }

  uploadStatus.textContent = 'Uploading...';
  const path = `uploads/${auth.currentUser.uid}/${Date.now()}_${file.name}`;
  const ref = storage.ref(path);
  try {
    const snapshot = await ref.put(file);
    const url = await snapshot.ref.getDownloadURL();
    await db.collection('posts').add({
      userId: auth.currentUser.uid,
      userName: auth.currentUser.displayName || auth.currentUser.email,
      mediaURL: url,
      mediaType: file.type.startsWith('image') ? 'photo' : 'video',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      comments: [],
      likes: []
    });
    uploadStatus.textContent = 'Uploaded ✅';
    fileInput.value = '';
  } catch (err) {
    console.error(err);
    alert('Upload failed: ' + err.message);
    uploadStatus.textContent = '';
  }
});

// Real-time posts listener (singleton)
let unsubscribePosts = null;
function startPostsListener() {
  if (unsubscribePosts) return;
  unsubscribePosts = db.collection('posts')
    .orderBy('createdAt', 'desc')
    .onSnapshot(snapshot => {
      const posts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      renderPosts(posts);
    }, err => console.error('Posts listener error', err));
}

function renderPosts(posts) {
  postsDiv.innerHTML = '';
  const currentUid = auth.currentUser ? auth.currentUser.uid : null;

  posts.forEach(post => {
    const div = document.createElement('div');
    div.className = 'post-item';

    const header = document.createElement('p');
    header.innerHTML = `<b>${escapeHtml(post.userName || 'Unknown')}</b> posted:`;
    div.appendChild(header);

    if (post.mediaType === 'photo') {
      const img = document.createElement('img');
      img.src = post.mediaURL;
      div.appendChild(img);
    } else {
      const vid = document.createElement('video');
      vid.controls = true;
      vid.src = post.mediaURL;
      div.appendChild(vid);
    }

    // actions (likes)
    const actions = document.createElement('div');
    actions.className = 'post-actions';
    const likes = Array.isArray(post.likes) ? post.likes : [];
    const liked = currentUid ? likes.includes(currentUid) : false;
    const likeBtn = document.createElement('button');
    likeBtn.textContent = (liked ? '❤️ ' : '🤍 ') + (likes.length || 0);
    likeBtn.onclick = () => toggleLike(post.id, liked);
    actions.appendChild(likeBtn);
    div.appendChild(actions);

    // comments
    const commentsDiv = document.createElement('div');
    commentsDiv.className = 'comments';
    const title = document.createElement('h4');
    title.textContent = 'Comments';
    commentsDiv.appendChild(title);

    const commentsList = document.createElement('div');
    const comments = Array.isArray(post.comments) ? post.comments : [];
    comments.forEach((c, i) => {
      const p = document.createElement('p');
      // if comment stored as object {userName, text} or string
      if (typeof c === 'string') {
        p.innerHTML = escapeHtml(c);
      } else {
        p.innerHTML = `<b>${escapeHtml(c.userName || 'User')}:</b> ${escapeHtml(c.text || '')}`;
      }
      commentsList.appendChild(p);
    });
    commentsDiv.appendChild(commentsList);

    // comment form
    const form = document.createElement('form');
    form.onsubmit = (e) => {
      e.preventDefault();
      const inp = form.querySelector('input');
      const text = inp.value.trim();
      if (text) {
        addComment(post.id, text);
        inp.value = '';
      }
    };
    const input = document.createElement('input');
    input.placeholder = 'Write a comment...';
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = 'Comment';
    form.appendChild(input);
    form.appendChild(submit);
    commentsDiv.appendChild(form);

    div.appendChild(commentsDiv);
    postsDiv.appendChild(div);
  });
}

// add a comment (saves as object with user info)
async function addComment(postId, text) {
  if (!auth.currentUser) { alert('Sign in to comment'); return; }
  const postRef = db.collection('posts').doc(postId);
  await postRef.update({
    comments: firebase.firestore.FieldValue.arrayUnion({
      userId: auth.currentUser.uid,
      userName: auth.currentUser.displayName || auth.currentUser.email,
      text,
      createdAt: new Date().toISOString()
    })
  });
}

// toggle like
async function toggleLike(postId, alreadyLiked) {
  if (!auth.currentUser) { alert('Sign in to like'); return; }
  const postRef = db.collection('posts').doc(postId);
  if (alreadyLiked) {
    await postRef.update({
      likes: firebase.firestore.FieldValue.arrayRemove(auth.currentUser.uid)
    });
  } else {
    await postRef.update({
      likes: firebase.firestore.FieldValue.arrayUnion(auth.currentUser.uid)
    });
  }
}

// tiny helper to avoid HTML injection when rendering user text
function escapeHtml(text) {
  if (!text) return '';
  return text.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
