import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
const app = initializeApp({ projectId: 'test' });
const db = getFirestore(app);
try {
  setDoc(doc(db, 'test/test'), { type: undefined });
  console.log("Success");
} catch (e) {
  console.log("Error:", e.message);
}
