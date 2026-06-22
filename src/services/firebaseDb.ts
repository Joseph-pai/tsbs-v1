import { db } from "@/lib/firebase/config";
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp, deleteDoc, updateDoc, doc, writeBatch, setDoc, getDoc } from "firebase/firestore";

export const saveScanRecord = async (userId: string, scanData: any, conditionDesc: string) => {
  try {
    const docRef = await addDoc(collection(db, `users/${userId}/scan_history`), {
      ...scanData,
      conditionDesc: conditionDesc,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (e) {
    console.error("Error adding scan record: ", e);
    throw e;
  }
};

export const getScanRecords = async (userId: string) => {
  try {
    const q = query(
      collection(db, `users/${userId}/scan_history`),
      orderBy("createdAt", "desc")
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (e) {
    console.error("Error getting scan records: ", e);
    throw e;
  }
};

export const saveBacktestRecord = async (userId: string, backtestData: any) => {
    try {
      const docRef = await addDoc(collection(db, `users/${userId}/backtest_data`), {
        ...backtestData,
        createdAt: serverTimestamp(),
      });
      return docRef.id;
    } catch (e) {
      console.error("Error adding backtest record: ", e);
      throw e;
    }
  };
  
export const getBacktestRecords = async (userId: string) => {
  try {
    const q = query(
      collection(db, `users/${userId}/backtest_data`),
      orderBy("createdAt", "desc")
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (e) {
      console.error("Error getting backtest records: ", e);
      throw e;
  }
};

export const deleteScanRecord = async (userId: string, recordId: string) => {
  try {
    await deleteDoc(doc(db, `users/${userId}/scan_history`, recordId));
  } catch (e) {
    console.error("Error deleting scan record: ", e);
    throw e;
  }
};

export const deleteScanRecordsByIds = async (userId: string, recordIds: string[]) => {
  if (recordIds.length === 0) return;
  try {
    // Firestore writeBatch supports max 500 ops; chunk if needed
    const CHUNK = 400;
    for (let i = 0; i < recordIds.length; i += CHUNK) {
      const batch = writeBatch(db);
      recordIds.slice(i, i + CHUNK).forEach(id => {
        batch.delete(doc(db, `users/${userId}/scan_history`, id));
      });
      await batch.commit();
    }
  } catch (e) {
    console.error("Error batch deleting scan records: ", e);
    throw e;
  }
};

export const updateScanRecord = async (userId: string, recordId: string, updatedData: any) => {
  try {
    const docRef = doc(db, `users/${userId}/scan_history`, recordId);
    await updateDoc(docRef, updatedData);
  } catch (e) {
    console.error("Error updating scan record: ", e);
    throw e;
  }
};

export const saveMockTradingData = async (userId: string, rows: any[]) => {
  try {
    const docRef = doc(db, `users/${userId}/sandbox`, "mock_trades");
    await setDoc(docRef, {
      rows,
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    console.error("Error saving mock trading data: ", e);
    throw e;
  }
};

export const getMockTradingData = async (userId: string) => {
  try {
    const docRef = doc(db, `users/${userId}/sandbox`, "mock_trades");
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data().rows || [];
    }
    return [];
  } catch (e) {
    console.error("Error getting mock trading data: ", e);
    throw e;
  }
};

