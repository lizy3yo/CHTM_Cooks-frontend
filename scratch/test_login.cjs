const url = 'http://localhost:3000/api/auth/login';
const body = JSON.stringify({ email: 'admin@example.com', password: 'password123' });

fetch(url, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: body
})
.then(async res => {
    console.log('Status:', res.status);
    console.log('Headers:', Object.fromEntries(res.headers.entries()));
    console.log('Body:', await res.json());
})
.catch(err => {
    console.error('Error:', err);
});
