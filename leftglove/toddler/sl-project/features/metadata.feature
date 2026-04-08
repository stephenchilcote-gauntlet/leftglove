Feature: Sieve metadata display
  After sieving, the metadata strip shows ambient browser state:
  cookies, localStorage keys, sessionStorage keys, and tab count.

  Background:
    Given :test opens the browser to 'http://localhost:8080?api=http://localhost:3333'

  Scenario: Metadata strip appears after sieving login page
    When :test clears ToddlerLoop.url-input
    And :test fills ToddlerLoop.url-input with 'http://localhost:3000/login'
    And :test clicks ToddlerLoop.navigate
    And pause for 5 seconds
    And :test should see ToddlerLoop.status with text 'elements'
    Then :test should see ToddlerLoop.metadata-strip
