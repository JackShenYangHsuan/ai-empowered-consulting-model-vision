// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyDNbNspMFuBQmojuL-JwvTL4ioZQvvIuak",
    authDomain: "command-center-e0e8b.firebaseapp.com",
    projectId: "command-center-e0e8b",
    storageBucket: "command-center-e0e8b.firebasestorage.app",
    messagingSenderId: "163210565133",
    appId: "1:163210565133:web:d2c97be765d763a01aa744",
    measurementId: "G-7XDL5NEG8Q"
};

// Initialize Firebase
let db = null;
let dbInitialized = false;

function initFirebase() {
    // Wait for Firebase SDK to be available
    if (window.firebase === undefined) {
        console.error('❌ Firebase SDK not loaded yet');
        return false;
    }

    if (dbInitialized) {
        console.log('✅ Firebase already initialized');
        return true;
    }

    try {
        // Initialize Firebase App
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
            console.log('✅ Firebase app initialized');
        }
        
        // Initialize Firestore
        db = firebase.firestore();
        dbInitialized = true;
        console.log('✅ Firebase Firestore initialized successfully');
        return true;
    } catch (error) {
        console.error('❌ Firebase initialization error:', error);
        return false;
    }
}

// Teammate Database Functions
const teammateDB = {
    // Create a new teammate
    async create(teammateData) {
        if (!db) {
            throw new Error('Firebase not initialized. Please refresh the page.');
        }
        
        try {
            console.log('Creating teammate in Firebase...');
            const teammateRef = await db.collection('agents').add({
                ...teammateData,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'draft'
            });
            
            console.log('✅ Teammate created with ID:', teammateRef.id);
            return { id: teammateRef.id, ...teammateData };
        } catch (error) {
            console.error('❌ Error creating teammate:', error);
            console.error('Error code:', error.code);
            console.error('Error message:', error.message);
            throw error;
        }
    },

    // Get teammate by ID
    async get(teammateId) {
        try {
            const doc = await db.collection('agents').doc(teammateId).get();
            if (doc.exists) {
                return { id: doc.id, ...doc.data() };
            } else {
                return null; // Return null instead of throwing error - agent may have been deleted
            }
        } catch (error) {
            console.error('❌ Error getting agent:', error);
            return null; // Return null on error instead of throwing
        }
    },

    // Update teammate
    async update(teammateId, data) {
        try {
            await db.collection('agents').doc(teammateId).update({
                ...data,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log('✅ Teammate updated:', teammateId);
        } catch (error) {
            console.error('❌ Error updating teammate:', error);
            throw error;
        }
    },

    // Get all teammates (limited to most recent 100 for performance)
    async getAll() {
        try {
            const snapshot = await db.collection('agents')
                .orderBy('createdAt', 'desc')
                .limit(100)
                .get();

            const teammates = [];
            snapshot.forEach(doc => {
                teammates.push({ id: doc.id, ...doc.data() });
            });

            return teammates;
        } catch (error) {
            console.error('❌ Error getting teammates:', error);
            throw error;
        }
    },

    // Delete teammate
    async delete(teammateId) {
        try {
            await db.collection('agents').doc(teammateId).delete();
            console.log('✅ Agent deleted:', teammateId);
        } catch (error) {
            console.error('❌ Error deleting agent:', error);
            throw error;
        }
    }
};

// Project Context Database Functions
const projectContextDB = {
    // Get project context (uses fixed document ID 'global')
    async get() {
        if (!db) {
            throw new Error('Firebase not initialized. Please refresh the page.');
        }

        try {
            const doc = await db.collection('projectContext').doc('global').get();
            if (doc.exists) {
                return doc.data();
            } else {
                // Return empty context if doesn't exist yet
                return {
                    keyQuestion: '',
                    constraints: '',
                    otherContext: ''
                };
            }
        } catch (error) {
            console.error('❌ Error getting project context:', error);
            throw error;
        }
    },

    // Save project context
    async save(contextData) {
        if (!db) {
            throw new Error('Firebase not initialized. Please refresh the page.');
        }

        try {
            await db.collection('projectContext').doc('global').set({
                keyQuestion: contextData.keyQuestion || '',
                constraints: contextData.constraints || '',
                otherContext: contextData.otherContext || '',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            console.log('✅ Project context saved to Firebase');
        } catch (error) {
            console.error('❌ Error saving project context:', error);
            throw error;
        }
    }
};

// Uber Eats Search Results Database Functions
const uberEatsDB = {
    // Save search results
    async saveSearch(searchData) {
        if (!db) {
            throw new Error('Firebase not initialized. Please refresh the page.');
        }

        try {
            const searchRef = await db.collection('uberEatsSearches').add({
                requestId: searchData.requestId,
                address: searchData.address,
                foodCraving: searchData.foodCraving,
                results: searchData.results,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            console.log('✅ Uber Eats search saved with ID:', searchRef.id);
            return { id: searchRef.id, ...searchData };
        } catch (error) {
            console.error('❌ Error saving Uber Eats search:', error);
            throw error;
        }
    },

    // Get all searches (limited to most recent 50)
    async getAll() {
        if (!db) {
            throw new Error('Firebase not initialized. Please refresh the page.');
        }

        try {
            const snapshot = await db.collection('uberEatsSearches')
                .orderBy('createdAt', 'desc')
                .limit(50)
                .get();

            const searches = [];
            snapshot.forEach(doc => {
                searches.push({ id: doc.id, ...doc.data() });
            });

            return searches;
        } catch (error) {
            console.error('❌ Error getting Uber Eats searches:', error);
            throw error;
        }
    },

    // Get search by request ID
    async getByRequestId(requestId) {
        if (!db) {
            throw new Error('Firebase not initialized. Please refresh the page.');
        }

        try {
            const snapshot = await db.collection('uberEatsSearches')
                .where('requestId', '==', requestId)
                .limit(1)
                .get();

            if (!snapshot.empty) {
                const doc = snapshot.docs[0];
                return { id: doc.id, ...doc.data() };
            }
            return null;
        } catch (error) {
            console.error('❌ Error getting Uber Eats search by request ID:', error);
            throw error;
        }
    },

    // Delete a search
    async delete(searchId) {
        if (!db) {
            throw new Error('Firebase not initialized. Please refresh the page.');
        }

        try {
            await db.collection('uberEatsSearches').doc(searchId).delete();
            console.log('✅ Uber Eats search deleted:', searchId);
        } catch (error) {
            console.error('❌ Error deleting Uber Eats search:', error);
            throw error;
        }
    }
};
