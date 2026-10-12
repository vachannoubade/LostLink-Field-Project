import type { Report, User, ReunionStory, Notification } from '../types';

export const demoUser: User = {
  id: 'u_1',
  name: 'Vivek Sharma',
  email: 'vivek.sharma@campus.edu',
  role: '3rd Year • Computer Science & Design',
  department: 'School of Engineering & Design',
  studentId: 'CS2024-8942',
  bio: 'Always happy to help fellow students track down lost gear around the Library and Student Union. Coffee enthusiast ☕',
  karmaPoints: 145,
  reunionsHelped: 4,
  phone: '+91 98765 43210'
};

export const CAMPUS_ZONES = [
  { id: 'Main Library', label: 'Main Library', icon: '📚', desc: 'Reading halls, stone benches & help desk', x: 28, y: 34 },
  { id: 'Student Union', label: 'Student Union', icon: '☕', desc: 'Lounge, club rooms & coffee counter', x: 55, y: 48 },
  { id: 'Science Building', label: 'Science Building', icon: '🔬', desc: 'Labs 101–405 & lecture atrium', x: 74, y: 28 },
  { id: 'Dining Hall', label: 'Dining Hall', icon: '🍱', desc: 'Main cafeteria & outdoor patio', x: 38, y: 68 },
  { id: 'Sports Complex', label: 'Sports Complex', icon: '🏀', desc: 'Indoor court, lockers & bleachers', x: 80, y: 70 },
  { id: 'Hostel Quad', label: 'Hostel Quad', icon: '🏡', desc: 'Courtyard pathways & common room', x: 18, y: 72 },
];

export const initialReports: Report[] = [
  {
    id: 'r_1',
    type: 'lost',
    title: 'Sony WF-1000XM5 Wireless Earbuds',
    category: 'Electronics',
    description: 'Lost my matte black Sony earbuds in their charging case. It has a tiny yellow smiley sticker on the bottom lid. Left them near the Main Library entrance on the stone bench after my 2 PM study session.',
    location: 'Main Library • Stone Benches',
    campusZone: 'Main Library',
    date: '2026-10-11',
    time: '14:30',
    status: 'lost',
    userId: 'u_2',
    createdAt: '2026-10-11T14:30:00Z',
    imageUrl: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=600&q=80',
    reporterName: 'Aarav Mehta',
    reporterRole: '2nd Year • Mechanical Eng',
    reporterVerified: true,
    gratitudeNote: 'Hot filter coffee & samosas at the Student Union canteen on me! ☕',
    urgency: 'high',
    helpfulCount: 14,
    comments: [
      {
        id: 'c_1',
        authorName: 'Rohan Kulkarni',
        authorRole: '3rd Year • Architecture',
        text: 'Hey Aarav! I think someone picked up a black Sony case from the right-side bench around 4:15 PM and gave it to the Library Security Desk.',
        createdAt: '2026-10-11T16:50:00Z',
        isSighting: true
      }
    ]
  },
  {
    id: 'r_2',
    type: 'found',
    title: 'Sony Black Earbuds Case (Near Library)',
    category: 'Electronics',
    description: 'Found a black bluetooth earbuds case sitting on the stone bench outside the Main Library entrance before the rain started. Handed them safely to Mrs. Nair at the Library Front Desk!',
    location: 'Main Library • Front Help Desk',
    campusZone: 'Main Library',
    date: '2026-10-11',
    time: '16:40',
    status: 'found',
    userId: 'u_3',
    createdAt: '2026-10-11T16:45:00Z',
    imageUrl: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=600&q=80',
    reporterName: 'Meera Krishnan',
    reporterRole: '4th Year • Biotechnology',
    reporterVerified: true,
    gratitudeNote: 'Safe with the librarian! Submit a claim with the case’s private identifying marks.',
    urgency: 'normal',
    helpfulCount: 19,
    hasPrivateVerification: true,
    estimatedValue: 3500,
    comments: []
  },
  {
    id: 'r_3',
    type: 'lost',
    title: 'Ocean Blue Hydro Flask (32 oz)',
    category: 'Accessories',
    description: 'Dark blue insulated water bottle covered in hackathon & Studio Ghibli stickers. Left under desk row 3 in Room 402 of the Science Building after the Data Structures lecture.',
    location: 'Science Building • Room 402',
    campusZone: 'Science Building',
    date: '2026-10-10',
    time: '11:15',
    status: 'lost',
    userId: 'u_1', // belongs to current user
    createdAt: '2026-10-10T11:15:00Z',
    imageUrl: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=600&q=80',
    reporterName: 'Vivek Sharma',
    reporterRole: '3rd Year • Computer Science & Design',
    reporterVerified: true,
    gratitudeNote: 'That bottle has been with me since freshman orientation! Huge thanks if found 💙',
    urgency: 'normal',
    helpfulCount: 9,
    comments: [
      {
        id: 'c_2',
        authorName: 'Lab Asst. Deepak',
        authorRole: 'Science Block Staff',
        text: 'Check the lost & found shelf next to Lab 401 tomorrow morning—our cleaning staff usually places bottles from 402 there.',
        createdAt: '2026-10-10T15:20:00Z',
        isSighting: true
      }
    ]
  },
  {
    id: 'r_4',
    type: 'found',
    title: 'Student ID Card — Ananya Deshmukh',
    category: 'ID Cards',
    description: 'Found a campus smart ID card on a lanyard near the Dining Hall juice counter during lunch hour. Kept it safe with the cashier counter so you can grab it anytime before 8 PM.',
    location: 'Dining Hall • Juice Counter',
    campusZone: 'Dining Hall',
    date: '2026-10-12',
    time: '13:10',
    status: 'found',
    userId: 'u_4',
    createdAt: '2026-10-12T08:20:00Z',
    reporterName: 'Kabir Verma',
    reporterRole: '1st Year • Economics',
    reporterVerified: true,
    gratitudeNote: 'Left with the Dining Hall supervisor at the main register!',
    urgency: 'high',
    helpfulCount: 22,
    hasPrivateVerification: false,
    comments: []
  },
  {
    id: 'r_5',
    type: 'lost',
    title: 'Apple 67W MacBook USB-C Charger',
    category: 'Electronics',
    description: 'White Apple USB-C power adapter with a braided MagSafe cable. Has a small piece of mint-green washi tape wrapped near the plug end so I don’t mix it up with my roommate’s.',
    location: 'Student Union • Co-working Booths',
    campusZone: 'Student Union',
    date: '2026-10-09',
    time: '18:00',
    status: 'lost',
    userId: 'u_5',
    createdAt: '2026-10-09T18:00:00Z',
    imageUrl: 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?w=600&q=80',
    reporterName: 'Neha Nair',
    reporterRole: '3rd Year • Communication Design',
    reporterVerified: true,
    gratitudeNote: 'Jury submission week 😭 Iced latte on me if you spot it!',
    urgency: 'high',
    helpfulCount: 11,
    comments: []
  },
  {
    id: 'r_6',
    type: 'found',
    title: 'Car & Hostel Room Keyring with Totoro Plush',
    category: 'Keys',
    description: 'Found a set of 3 brass keys attached to a grey mini Totoro plush keychain on the bleachers at the indoor basketball court.',
    location: 'Sports Complex • Bleachers Section B',
    campusZone: 'Sports Complex',
    date: '2026-10-11',
    time: '19:30',
    status: 'found',
    userId: 'u_6',
    createdAt: '2026-10-11T19:30:00Z',
    imageUrl: 'https://images.unsplash.com/photo-1582139329536-e7284fece509?w=600&q=80',
    reporterName: 'Coach Rajeev',
    reporterRole: 'Athletics Coordinator',
    reporterVerified: true,
    gratitudeNote: 'Hanging in the Sports Complex equipment office key cabinet.',
    urgency: 'high',
    helpfulCount: 16,
    hasPrivateVerification: true,
    enhancedVerification: true,
    estimatedValue: 6500,
    comments: []
  },
  {
    id: 'r_7',
    type: 'lost',
    title: 'Moleskine Dotted Sketchbook & Pencil Roll',
    category: 'Books',
    description: 'Tan hardcover sketchbook filled with urban sketching assignments and a canvas roll of Micron pens.',
    location: 'Hostel Quad • Banyan Tree Courtyard',
    campusZone: 'Hostel Quad',
    date: '2026-10-08',
    time: '17:00',
    status: 'resolved',
    userId: 'u_1',
    createdAt: '2026-10-08T17:00:00Z',
    imageUrl: 'https://images.unsplash.com/photo-1544816155-12df9643f363?w=600&q=80',
    reporterName: 'Vivek Sharma',
    reporterRole: '3rd Year • Computer Science & Design',
    reporterVerified: true,
    gratitudeNote: 'Reunited within 3 hours thanks to Sana from Hostel B! 🎉',
    urgency: 'normal',
    helpfulCount: 27,
    comments: []
  }
];

export const initialReunionStories: ReunionStory[] = [
  {
    id: 'rs_1',
    itemTitle: 'Moleskine Sketchbook & Pen Roll',
    category: 'Books',
    ownerName: 'Vivek S.',
    finderName: 'Sana M.',
    location: 'Hostel Quad',
    quote: 'Had 6 weeks of hand-drawn UI wireframes inside. Sana spotted it before the evening drizzle—lifesaver!',
    timeAgo: '2 days ago'
  },
  {
    id: 'rs_2',
    itemTitle: 'Casio FX-991CW Scientific Calculator',
    category: 'Electronics',
    ownerName: 'Devansh P.',
    finderName: 'Prof. Kulkarni',
    location: 'Science Building',
    quote: 'Returned right before my Thermodynamics midterm! Our campus community is the best.',
    timeAgo: 'Yesterday'
  },
  {
    id: 'rs_3',
    itemTitle: 'Olive Fjällräven Kånken Backpack',
    category: 'Bags',
    ownerName: 'Riya T.',
    finderName: 'Barista Arjun',
    location: 'Student Union',
    quote: 'Left it by the coffee counter rushing to studio. Arjun kept it behind the counter safe and sound!',
    timeAgo: '3 days ago'
  }
];

export const initialNotifications: Notification[] = [
  {
    id: 'n_seed_1',
    userId: 'u_1',
    title: '✨ 90% AI Match Detected!',
    message: 'Sony WF-1000XM5 Wireless Earbuds & Sony Black Earbuds Case at Main Library look like a strong match.',
    read: false,
    createdAt: '2026-10-12T09:15:00Z',
    link: '/ai-matches',
    type: 'match'
  },
  {
    id: 'n_seed_2',
    userId: 'u_1',
    title: '👀 New Community Sighting on your Hydro Flask',
    message: 'Lab Asst. Deepak commented: "Check the lost & found shelf next to Lab 401 tomorrow morning..."',
    read: false,
    createdAt: '2026-10-11T15:20:00Z',
    link: '/my-reports',
    type: 'sighting'
  }
];
