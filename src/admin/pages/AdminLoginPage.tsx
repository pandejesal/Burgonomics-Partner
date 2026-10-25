/**
 * @deprecated SINGLE SIGN-IN — legacy second login, retained as a redirect shim.
 *
 * The standalone administrative gateway no longer exists: Partner is the
 * admin. Any surviving deep-link to /admin/login lands here and bounces to
 * the single operator login at /login. The file stays so old imports and
 * handover screenshot 18-admin-login.png have a code anchor, but it renders
 * no credential form and mints no second session.
 */
import React from "react";
import { Navigate } from "react-router-dom";

interface AdminLoginPageProps {
  onSuccess?: () => void;
}

export const AdminLoginPage: React.FC<AdminLoginPageProps> = () => {
  return <Navigate to="/login" replace />;
};
