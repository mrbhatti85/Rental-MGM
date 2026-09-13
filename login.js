if (sessionStorage.getItem('rms_session') === 'active') {
  location.href = 'index.html';
}

document.getElementById('togglePassword').addEventListener('click', (e) => {
  const passInput = document.getElementById('loginPass');
  const showing = passInput.type === 'text';
  passInput.type = showing ? 'password' : 'text';
  e.currentTarget.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
});

const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const user = document.getElementById('loginUser').value.trim();
  const pass = document.getElementById('loginPass').value;
  const submitBtn = loginForm.querySelector('button[type="submit"]');

  loginError.hidden = true;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Signing in...';

  try {
    const users = await loadUsersOnce();
    const match = users.find(u => u.username.toLowerCase() === user.toLowerCase() && u.password === pass);

    if (match) {
      sessionStorage.setItem('rms_session', 'active');
      sessionStorage.setItem('rms_current_user', JSON.stringify({
        username: match.username, name: match.name, role: match.role,
      }));
      location.href = 'index.html';
    } else {
      loginError.textContent = 'Invalid username or password.';
      loginError.hidden = false;
    }
  } catch (err) {
    if (err.code === 'permission-denied') {
      loginError.textContent = 'Firestore is blocking access. Go to Firebase Console → Firestore Database → Rules and publish the rules from firestore.rules.';
    } else {
      loginError.textContent = 'Could not reach the database: ' + err.message;
    }
    loginError.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign In';
  }
});
