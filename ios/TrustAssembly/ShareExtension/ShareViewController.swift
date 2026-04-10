import UIKit
import UniformTypeIdentifiers

/// Share Extension — receives a URL from Safari or any app and creates
/// a server-side draft on Trust Assembly. When the user opens the main
/// app, the draft auto-loads in the Submit form.
class ShareViewController: UIViewController {

    private let sharedSuiteName = "group.org.trustassembly.shared"
    private let baseURL = "https://trustassembly.org"

    private var statusLabel: UILabel!
    private var urlLabel: UILabel!
    private var submitButton: UIButton!
    private var cancelButton: UIButton!
    private var typeSelector: UISegmentedControl!
    private var headlineLabel: UILabel!

    private var sharedURL: String?
    private var fetchedHeadline: String?

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
        extractURL()
    }

    // MARK: - UI Setup

    private func setupUI() {
        view.backgroundColor = UIColor(red: 0.98, green: 0.97, blue: 0.96, alpha: 1) // vellum

        // Header
        let header = UIView()
        header.backgroundColor = UIColor(red: 0.1, green: 0.1, blue: 0.1, alpha: 1)
        header.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(header)

        let titleLabel = UILabel()
        titleLabel.text = "TRUST ASSEMBLY"
        titleLabel.font = .systemFont(ofSize: 14, weight: .bold)
        titleLabel.textColor = UIColor(red: 0.72, green: 0.59, blue: 0.24, alpha: 1)
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        header.addSubview(titleLabel)

        let mottoLabel = UILabel()
        mottoLabel.text = "Quick Submit"
        mottoLabel.font = .systemFont(ofSize: 10, weight: .medium)
        mottoLabel.textColor = .lightGray
        mottoLabel.translatesAutoresizingMaskIntoConstraints = false
        header.addSubview(mottoLabel)

        // URL display
        urlLabel = UILabel()
        urlLabel.text = "Loading URL..."
        urlLabel.font = .monospacedSystemFont(ofSize: 11, weight: .regular)
        urlLabel.textColor = .secondaryLabel
        urlLabel.numberOfLines = 2
        urlLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(urlLabel)

        // Headline
        headlineLabel = UILabel()
        headlineLabel.text = "Fetching headline..."
        headlineLabel.font = UIFont(name: "Georgia", size: 16) ?? .systemFont(ofSize: 16, weight: .bold)
        headlineLabel.textColor = UIColor(red: 0.17, green: 0.17, blue: 0.17, alpha: 1)
        headlineLabel.numberOfLines = 3
        headlineLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(headlineLabel)

        // Type selector
        typeSelector = UISegmentedControl(items: ["Correction", "Affirmation"])
        typeSelector.selectedSegmentIndex = 0
        typeSelector.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(typeSelector)

        // Status
        statusLabel = UILabel()
        statusLabel.text = ""
        statusLabel.font = .systemFont(ofSize: 12)
        statusLabel.textColor = .secondaryLabel
        statusLabel.textAlignment = .center
        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(statusLabel)

        // Buttons
        submitButton = UIButton(type: .system)
        submitButton.setTitle("Save Draft & Open App", for: .normal)
        submitButton.titleLabel?.font = .systemFont(ofSize: 15, weight: .semibold)
        submitButton.backgroundColor = UIColor(red: 0.72, green: 0.59, blue: 0.24, alpha: 1)
        submitButton.setTitleColor(.white, for: .normal)
        submitButton.layer.cornerRadius = 8
        submitButton.addTarget(self, action: #selector(saveDraft), for: .touchUpInside)
        submitButton.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(submitButton)

        cancelButton = UIButton(type: .system)
        cancelButton.setTitle("Cancel", for: .normal)
        cancelButton.titleLabel?.font = .systemFont(ofSize: 13)
        cancelButton.setTitleColor(.secondaryLabel, for: .normal)
        cancelButton.addTarget(self, action: #selector(cancel), for: .touchUpInside)
        cancelButton.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(cancelButton)

        NSLayoutConstraint.activate([
            header.topAnchor.constraint(equalTo: view.topAnchor),
            header.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            header.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            header.heightAnchor.constraint(equalToConstant: 60),

            titleLabel.centerYAnchor.constraint(equalTo: header.centerYAnchor, constant: -8),
            titleLabel.centerXAnchor.constraint(equalTo: header.centerXAnchor),
            mottoLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 2),
            mottoLabel.centerXAnchor.constraint(equalTo: header.centerXAnchor),

            urlLabel.topAnchor.constraint(equalTo: header.bottomAnchor, constant: 16),
            urlLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
            urlLabel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),

            headlineLabel.topAnchor.constraint(equalTo: urlLabel.bottomAnchor, constant: 12),
            headlineLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
            headlineLabel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),

            typeSelector.topAnchor.constraint(equalTo: headlineLabel.bottomAnchor, constant: 16),
            typeSelector.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
            typeSelector.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),

            statusLabel.topAnchor.constraint(equalTo: typeSelector.bottomAnchor, constant: 12),
            statusLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
            statusLabel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),

            submitButton.topAnchor.constraint(equalTo: statusLabel.bottomAnchor, constant: 16),
            submitButton.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
            submitButton.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),
            submitButton.heightAnchor.constraint(equalToConstant: 44),

            cancelButton.topAnchor.constraint(equalTo: submitButton.bottomAnchor, constant: 8),
            cancelButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
        ])
    }

    // MARK: - Extract URL from share input

    private func extractURL() {
        guard let items = extensionContext?.inputItems as? [NSExtensionItem] else {
            statusLabel.text = "No content shared"
            return
        }

        for item in items {
            guard let attachments = item.attachments else { continue }
            for provider in attachments {
                if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                    provider.loadItem(forTypeIdentifier: UTType.url.identifier) { [weak self] data, error in
                        DispatchQueue.main.async {
                            if let url = data as? URL {
                                self?.handleURL(url.absoluteString)
                            } else if let urlData = data as? Data, let url = URL(dataRepresentation: urlData, relativeTo: nil) {
                                self?.handleURL(url.absoluteString)
                            }
                        }
                    }
                    return
                }
                if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                    provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) { [weak self] data, error in
                        DispatchQueue.main.async {
                            if let text = data as? String, text.hasPrefix("http") {
                                self?.handleURL(text)
                            }
                        }
                    }
                    return
                }
            }
        }
    }

    private func handleURL(_ url: String) {
        sharedURL = url
        urlLabel.text = url

        // Fetch headline via import API
        fetchHeadline(url: url)
    }

    // MARK: - Fetch article metadata

    private func fetchHeadline(url: String) {
        guard let encodedURL = url.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let apiURL = URL(string: "\(baseURL)/api/import?url=\(encodedURL)") else { return }

        var request = URLRequest(url: apiURL)
        request.timeoutInterval = 10

        // Add auth if available
        let defaults = UserDefaults(suiteName: sharedSuiteName)
        if let token = defaults?.string(forKey: "ta-auth-token") {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            DispatchQueue.main.async {
                guard let data = data,
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                    self?.headlineLabel.text = "(Could not fetch headline — you can add it in the app)"
                    return
                }
                let title = json["title"] as? String ?? json["headline"] as? String
                self?.fetchedHeadline = title
                self?.headlineLabel.text = title ?? "(No headline found)"
            }
        }.resume()
    }

    // MARK: - Save draft to server

    @objc private func saveDraft() {
        guard let url = sharedURL else {
            statusLabel.text = "No URL to save"
            return
        }

        let defaults = UserDefaults(suiteName: sharedSuiteName)
        guard let token = defaults?.string(forKey: "ta-auth-token") else {
            statusLabel.text = "Sign in to Trust Assembly first"
            statusLabel.textColor = UIColor(red: 0.77, green: 0.34, blue: 0.25, alpha: 1)
            return
        }

        submitButton.isEnabled = false
        statusLabel.text = "Saving draft..."
        statusLabel.textColor = .secondaryLabel

        let submissionType = typeSelector.selectedSegmentIndex == 0 ? "correction" : "affirmation"

        let draftData: [String: Any] = [
            "form": [
                "url": url,
                "originalHeadline": fetchedHeadline ?? "",
                "replacement": "",
                "reasoning": "",
                "submissionType": submissionType,
            ]
        ]

        let body: [String: Any] = [
            "url": url,
            "title": fetchedHeadline ?? "",
            "draftData": draftData,
        ]

        guard let apiURL = URL(string: "\(baseURL)/api/drafts"),
              let bodyData = try? JSONSerialization.data(withJSONObject: body) else { return }

        var request = URLRequest(url: apiURL)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = bodyData

        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            DispatchQueue.main.async {
                if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 {
                    self?.statusLabel.text = "Draft saved! Opening app..."
                    self?.statusLabel.textColor = UIColor(red: 0.11, green: 0.37, blue: 0.25, alpha: 1)

                    // Open the main app to the submit screen
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
                        self?.extensionContext?.completeRequest(returningItems: nil)
                    }
                } else {
                    self?.submitButton.isEnabled = true
                    self?.statusLabel.text = "Failed to save — try again"
                    self?.statusLabel.textColor = UIColor(red: 0.77, green: 0.34, blue: 0.25, alpha: 1)
                }
            }
        }.resume()
    }

    @objc private func cancel() {
        extensionContext?.cancelRequest(withError: NSError(domain: "org.trustassembly", code: 0))
    }
}
