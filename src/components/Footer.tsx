import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer className="border-t border-border py-12">
      <div className="container">
        <div className="text-center">
          <Link to="/" className="font-heading text-sm font-semibold text-accent hover:underline">
            MiniGiantGames
          </Link>
          <p className="mt-4 text-xs text-muted-foreground">© 2026 MiniGiantGames. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
