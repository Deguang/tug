class Tug < Formula
  desc "Browser extension store publishing companion and local metadata orchestrator"
  homepage "https://github.com/Deguang/tug"
  url "https://github.com/Deguang/tug/releases/download/v0.2.1/tug-v0.2.1.tar.gz"
  sha256 "ca2dfcdfad7aa70f34294245a2702cc61b11e4a0d9819e104c0a2852d84034af"
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
