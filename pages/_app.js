import Head from "next/head";
import "@/styles/globals.scss";
import "@/styles/Navbar.scss";
import "@/styles/Leftside.scss";
import "@/styles/Login.scss";
import "@/styles/layout.scss";
import "@/styles/sunfee-kalkulator.scss";
import "@/styles/ustawienia-kalkulatora.scss";
import "@/styles/lista-wycen-kalkulator.scss";
import "@/styles/uzytkownicy.scss";
import { AuthProvider } from "@/context/AuthContext";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>Kalkulator v2</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta charSet="utf-8" />
        <meta httpEquiv="Content-Language" content="pl" />
        <meta name="google" content="notranslate" />
      </Head>
      <AuthProvider>
        <Component {...pageProps} />
        <ToastContainer position="top-right" autoClose={5000} theme="light" />
      </AuthProvider>
    </>
  );
}
