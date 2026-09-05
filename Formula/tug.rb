class Tug < Formula
  desc "Browser extension store publishing companion and local metadata orchestrator"
  homepage "https://github.com/Deguang/tug"
  url "https://github.com/Deguang/tug/archive/refs/tags/v0.1.0.tar.gz"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *Language::Node.std_npm_install_args(libexec)
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    system "#{bin}/tug", "--version"
  end
end
