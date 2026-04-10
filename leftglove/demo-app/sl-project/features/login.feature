Feature: Login
  The demo app login page accepts credentials and redirects
  to the fundraiser on success, or shows an error on failure.

  Scenario: Successful login with valid credentials
    Given :test opens the browser to 'http://localhost:3000/login'
    When :test fills Login.email-input with 'alice@example.com'
    And :test fills Login.password-input with 'password1'
    And :test clicks Login.login-submit
    Then :test should see Fundraiser.title

  Scenario: Failed login shows error message
    Given :test opens the browser to 'http://localhost:3000/login'
    When :test fills Login.email-input with 'wrong@example.com'
    And :test fills Login.password-input with 'wrongpass'
    And :test clicks Login.login-submit
    Then :test should see Login.status-msg with text 'Invalid email or password.'
