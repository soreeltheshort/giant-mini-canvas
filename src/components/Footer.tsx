const Footer = () => {
  return (
    <footer className="border-t border-border py-12">
      <div className="container">
        <div className="flex flex-col items-center gap-6 md:flex-row md:justify-between">
          <div>
            <p className="font-heading text-sm font-semibold text-foreground">MiniGiantGames</p>
            <p className="mt-1 text-xs text-muted-foreground">Small Studio. Deep Systems.</p>
          </div>
          <div className="flex items-center gap-6">
            <a href="#" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Twitter</a>
            <a href="#" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Discord</a>
            <a href="#" className="text-sm text-muted-foreground transition-colors hover:text-foreground">YouTube</a>
            <a href="#" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Steam</a>
          </div>
        </div>
        <div className="mt-8 border-t border-border pt-6 text-center">
          <p className="text-xs text-muted-foreground">© 2026 MiniGiantGames. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
