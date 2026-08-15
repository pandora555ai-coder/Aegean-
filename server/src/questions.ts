import type { Question } from '@game/shared';

// Temporary hardcoded content - a proper question bank comes later.
const QUESTIONS: Question[] = [
  {
    id: 'myth-1',
    category: 'Ελληνική Μυθολογία',
    question: 'Ποιος θεός είναι ο βασιλιάς των θεών στον Όλυμπο;',
    options: ['Ποσειδώνας', 'Δίας', 'Άρης', 'Απόλλωνας'],
    correctIndex: 1,
  },
  {
    id: 'myth-2',
    category: 'Ελληνική Μυθολογία',
    question: 'Ποια θεά γεννήθηκε από το κεφάλι του Δία;',
    options: ['Αθηνά', 'Ήρα', 'Αφροδίτη', 'Άρτεμις'],
    correctIndex: 0,
  },
  {
    id: 'myth-3',
    category: 'Ελληνική Μυθολογία',
    question: 'Ποιος ήρωας σκότωσε τη Μέδουσα;',
    options: ['Θησέας', 'Ηρακλής', 'Περσέας', 'Αχιλλέας'],
    correctIndex: 2,
  },
  {
    id: 'myth-4',
    category: 'Ελληνική Μυθολογία',
    question: 'Ποιο τέρας φύλαγε την είσοδο του Κάτω Κόσμου;',
    options: ['Κέρβερος', 'Μινώταυρος', 'Σφίγγα', 'Χίμαιρα'],
    correctIndex: 0,
  },
  {
    id: 'myth-5',
    category: 'Ελληνική Μυθολογία',
    question: 'Ποιος θεός είναι ο αγγελιοφόρος των θεών;',
    options: ['Ήφαιστος', 'Ερμής', 'Διόνυσος', 'Άδης'],
    correctIndex: 1,
  },
];

export function getQuestions(): Question[] {
  return QUESTIONS;
}
