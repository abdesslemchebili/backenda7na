const http = require('http');

// Configuration
const BASE_URL = 'http://localhost:5000';
const ENDPOINTS = [
  '/api/health',
  '/api/auth/login'
];

// Fonction pour faire une requête HTTP
function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const response = {
            statusCode: res.statusCode,
            headers: res.headers,
            body: JSON.parse(body)
          };
          resolve(response);
        } catch (error) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: body
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

// Tests
async function runTests() {
  console.log('🧪 Tests de l\'API - Plateforme d\'École de Langues\n');

  // Test 1: Endpoint de santé
  console.log('1️⃣ Test de l\'endpoint de santé...');
  try {
    const healthResponse = await makeRequest('GET', '/api/health');
    if (healthResponse.statusCode === 200) {
      console.log('✅ Endpoint de santé: OK');
      console.log(`   Message: ${healthResponse.body.message}`);
    } else {
      console.log('❌ Endpoint de santé: ÉCHEC');
    }
  } catch (error) {
    console.log('❌ Endpoint de santé: ERREUR');
    console.log(`   Erreur: ${error.message}`);
  }

  console.log('');

  // Test 2: Endpoint de connexion (sans données valides)
  console.log('2️⃣ Test de l\'endpoint de connexion...');
  try {
    const loginResponse = await makeRequest('POST', '/api/auth/login', {
      email: 'test@example.com',
      password: 'wrongpassword'
    });
    
    if (loginResponse.statusCode === 401) {
      console.log('✅ Endpoint de connexion: OK (erreur attendue)');
      console.log(`   Message: ${loginResponse.body.message}`);
    } else {
      console.log('❌ Endpoint de connexion: Réponse inattendue');
      console.log(`   Status: ${loginResponse.statusCode}`);
    }
  } catch (error) {
    console.log('❌ Endpoint de connexion: ERREUR');
    console.log(`   Erreur: ${error.message}`);
  }

  console.log('');

  // Test 3: Endpoint protégé sans token
  console.log('3️⃣ Test d\'un endpoint protégé sans token...');
  try {
    const protectedResponse = await makeRequest('GET', '/api/auth/profile');
    
    if (protectedResponse.statusCode === 401) {
      console.log('✅ Endpoint protégé: OK (accès refusé comme attendu)');
      console.log(`   Message: ${protectedResponse.body.message}`);
    } else {
      console.log('❌ Endpoint protégé: Réponse inattendue');
      console.log(`   Status: ${protectedResponse.statusCode}`);
    }
  } catch (error) {
    console.log('❌ Endpoint protégé: ERREUR');
    console.log(`   Erreur: ${error.message}`);
  }

  console.log('\n🎉 Tests terminés !');
  console.log('\n📝 Prochaines étapes:');
  console.log('   1. Exécuter: npm run seed');
  console.log('   2. Tester la connexion avec les comptes de test');
  console.log('   3. Implémenter les autres contrôleurs et routes');
}

// Exécuter les tests
runTests().catch(console.error); 