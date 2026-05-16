import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/context/AuthContext";

const withAuth = (WrappedComponent, allowedRoles = []) => {
  return function ProtectedComponent(props) {
    const { user, loading } = useAuth();
    const router = useRouter();
    const [initialized, setInitialized] = useState(false);

    useEffect(() => {
      if (!loading && !initialized) {
        if (!user) {
          router.replace("/login");
        } else if (
          allowedRoles.length > 0 &&
          !allowedRoles.includes(user.role)
        ) {
          router.replace("/unauthorized");
        }
        setInitialized(true);
      }
    }, [user, loading, allowedRoles, router, initialized]);

    if (loading || !initialized) {
      return <div className="login-page">Ładowanie...</div>;
    }

    return <WrappedComponent {...props} />;
  };
};

export default withAuth;
