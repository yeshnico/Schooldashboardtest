import type { EmailInput } from '../types/school';

function offsetDateIso(daysFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}

function formatReadableDate(daysFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function createSampleEmails(): EmailInput[] {
  const sentToday = offsetDateIso(0);
  const sentYesterday = offsetDateIso(-1);
  const in2Days = formatReadableDate(2);
  const in5Days = formatReadableDate(5);
  const in9Days = formatReadableDate(9);
  const in12Days = formatReadableDate(12);

  return [
    {
      id: 'sample-1',
      sender: 'office@oakridgeelementary.edu',
      subject: 'Year 4 Science Museum Field Trip — Permission Slip & Lunch Info',
      date: sentToday,
      attachments: [],
      body: `Dear Year 4 Families,

Our class field trip to the Natural History & Science Museum is scheduled for ${in9Days} from 8:45 AM to 2:30 PM.

Action Required by ${in2Days} at 3:00 PM:
1. Please sign and return the attached paper permission slip to Ms. Patel's classroom, OR submit consent on the Parent Portal.
2. Submit the $18.00 bus and admission fee via SchoolPay before the ${in2Days} deadline.

What your child needs on trip day (${in9Days}):
- Wear the navy school polo shirt and comfortable walking shoes.
- Pack a nut-free disposable bag lunch and a labeled refillable water bottle.
- Arrive by 8:30 AM sharp so buses can depart on time.

We also need 3 parent chaperones. Reply to this email by ${in5Days} if you have district clearance and would like to volunteer.

Warm regards,
Oakridge Elementary Front Office`,
    },
    {
      id: 'sample-2',
      sender: 'principal@oakridgeelementary.edu',
      subject: 'Weekly Family Bulletin: Early Dismissal, Book Fair & Winter Concert',
      date: sentYesterday,
      attachments: [],
      body: `Hello Oakridge Families,

Here are the important updates for the next two weeks:

EARLY DISMISSAL — ${in5Days}
School will dismiss early at 12:15 PM for staff professional development. After-school clubs are cancelled on this day; please arrange pickup or AfterCare in advance.

SCHOLASTIC BOOK FAIR
The library Book Fair runs next week. If you would like to fund an eWallet for your child, please top up their account by ${in5Days} at 5:00 PM so they can shop during their class library slot.

WINTER MUSIC CONCERT — ${in12Days}
Doors open at 6:00 PM in the Main Auditorium (performance begins at 6:30 PM). Performing students should wear dark pants/skirts and a plain white top. Please RSVP with your family seat count (max 4 guests) on the school portal by ${in9Days}.

REMINDER: Please check the Lost & Found rack outside the cafeteria before ${in12Days}; unclaimed jackets will be donated.

Best,
Dr. Elena Brooks, Principal`,
    },
  ];
}

export function createBlankEmail(): EmailInput {
  return {
    id: `email-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    sender: '',
    subject: '',
    date: offsetDateIso(0),
    body: '',
    attachments: [],
  };
}
