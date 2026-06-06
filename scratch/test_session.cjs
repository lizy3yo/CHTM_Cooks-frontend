const loginUrl = 'http://localhost:3000/api/auth/login';
const meUrl = 'http://localhost:3000/api/auth/me';

async function testSession() {
    // 1. Login
    console.log('Sending login request...');
    const loginRes = await fetch(loginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@example.com', password: 'password123' })
    });

    console.log('Login Status:', loginRes.status);
    
    // Get all cookies from Set-Cookie headers
    const cookies = loginRes.headers.getSetCookie();
    console.log('Cookies received:', cookies);

    if (cookies.length === 0) {
        console.error('No cookies received from SvelteKit!');
        return;
    }

    // Combine cookies into a single Cookie header
    const cookieHeader = cookies.map(c => c.split(';')[0]).join('; ');
    console.log('Cookie header for next request:', cookieHeader);

    // 2. Fetch /me
    console.log('\nSending /me request with cookie...');
    const meRes = await fetch(meUrl, {
        method: 'GET',
        headers: {
            'Cookie': cookieHeader
        }
    });

    console.log('Me Status:', meRes.status);
    const meBody = await meRes.json();
    console.log('Me Body:', meBody);
}

testSession().catch(console.error);
