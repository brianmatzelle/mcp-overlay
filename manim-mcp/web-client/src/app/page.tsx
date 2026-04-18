// Auth0 imports - commented out for MVP
// import { auth0 } from "@/lib/auth0";
// import LoginButton from "@/components/LoginButton";
// import LogoutButton from "@/components/LogoutButton";
// import Profile from "@/components/Profile";
import ChatInterface from "@/components/ChatInterface";

// MVP version - no auth required
export default function Home() {
  return <ChatInterface />;
}

// Original Auth0 version:
// export default async function Home() {
//   const session = await auth0.getSession();
//   const user = session?.user;
//
//   return (
//     <div>
//         <h1 className="main-title">Math Tutor</h1>
//         
//           {user ? (
//           <>
//               <ChatInterface />
//               </>
//           ) : (
//             <>
//               <p className="action-text">
//                 Welcome! Please log in to access your protected content.
//               </p>
//               <LoginButton />
//             </>
//           )}
//     </div>
//   );
// }
